import { type ChangeEvent, useEffect, useMemo, useState } from 'react';

import { useNavigate } from '@tanstack/react-router';
import { motion } from 'framer-motion';
import {
  ChevronDown,
  ChevronUp,
  RefreshCw,
  SaveAll,
  Trash,
  UploadCloud,
} from 'lucide-react';
import { toast } from 'sonner';

import { Layout } from '@/components';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  type TimetableRecurringEvent,
  calendarApi,
} from '@/services/api/calendarApi';
import { useAuthStore } from '@/store/useAuthStore';

interface CalendarEvent {
  id: string;
  calendarId: string;
  title: string;
  description?: string;
  location?: string;
  startTime: Date;
  endTime: Date;
  isAllDay: boolean;
  isBusy: boolean;
  calendarTitle?: string;
  calendarColor?: string;
}

interface Calendar {
  id: string;
  title: string;
  description?: string;
  timeZone?: string;
  accessRole?: string;
  color?: string;
  foregroundColor?: string;
  isPrimary: boolean;
}

interface ExtractedScheduleEvent {
  title: string;
  location?: string;
  weekday: number | string;
  startTime: string;
  endTime: string;
}

const normalizeEventRange = (event: CalendarEvent) => {
  const eventStart = new Date(event.startTime);
  const eventEnd = new Date(event.endTime);
  const startsAtMidnight =
    eventStart.getHours() === 0 &&
    eventStart.getMinutes() === 0 &&
    eventStart.getSeconds() === 0 &&
    eventStart.getMilliseconds() === 0;
  const endsAtMidnight =
    eventEnd.getHours() === 0 &&
    eventEnd.getMinutes() === 0 &&
    eventEnd.getSeconds() === 0 &&
    eventEnd.getMilliseconds() === 0;
  const durationMs = eventEnd.getTime() - eventStart.getTime();
  const isAllDayLike =
    event.isAllDay ||
    (startsAtMidnight && endsAtMidnight && durationMs >= 86_400_000);
  const endExclusive =
    eventEnd.getTime() > eventStart.getTime()
      ? new Date(eventEnd.getTime() - 1)
      : eventEnd;
  return { start: eventStart, end: endExclusive, isAllDayLike };
};

const GEMINI_MODEL = 'gemini-3-flash-preview';

const fileToBase64 = (file: File) =>
  new Promise<{ mimeType: string; base64: string }>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result ?? '');
      const commaIndex = result.indexOf(',');
      if (commaIndex === -1) {
        reject(new Error('이미지 데이터를 읽을 수 없습니다.'));
        return;
      }
      resolve({
        mimeType: file.type || 'image/png',
        base64: result.slice(commaIndex + 1),
      });
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });

const extractJsonFromText = (text: string) => {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const raw = fenced ? fenced[1] : text;
  const arrayStart = raw.indexOf('[');
  const objectStart = raw.indexOf('{');
  const startIndex =
    arrayStart !== -1 && (objectStart === -1 || arrayStart < objectStart)
      ? arrayStart
      : objectStart;
  if (startIndex === -1) {
    throw new Error('응답에서 JSON을 찾을 수 없습니다.');
  }
  const arrayEnd = raw.lastIndexOf(']');
  const objectEnd = raw.lastIndexOf('}');
  const endIndex = arrayEnd > objectEnd ? arrayEnd : objectEnd;
  if (endIndex === -1) {
    throw new Error('응답 JSON이 완전하지 않습니다.');
  }
  return JSON.parse(raw.slice(startIndex, endIndex + 1));
};

const weekdayToNumber = (value: number | string) => {
  if (typeof value === 'number') return value;
  const normalized = value.trim().toLowerCase();
  const map: Record<string, number> = {
    월: 1,
    화: 2,
    수: 3,
    목: 4,
    금: 5,
    토: 6,
    일: 7,
    mon: 1,
    tue: 2,
    wed: 3,
    thu: 4,
    fri: 5,
    sat: 6,
    sun: 7,
  };
  return map[normalized] ?? Number(normalized);
};

const parseTime = (value: string) => {
  const [hourPart, minutePart] = value.split(':');
  const hour = Number(hourPart);
  const minute = Number(minutePart ?? '0');
  if (Number.isNaN(hour) || Number.isNaN(minute)) return null;
  return { hour, minute };
};

const parseDateInput = (value: string) => {
  const [year, month, day] = value.split('-').map((part) => Number(part));
  if (!year || !month || !day) return new Date(value);
  return new Date(year, month - 1, day);
};

const normalizeDateRange = (startValue: string, endValue: string) => {
  const start = parseDateInput(startValue);
  const end = parseDateInput(endValue);
  start.setHours(0, 0, 0, 0);
  end.setHours(23, 59, 59, 999);
  return { start, end };
};

const sortEventsByStartWithAllDayFirst = (items: CalendarEvent[]) =>
  [...items].sort((a, b) => {
    const left = normalizeEventRange(a);
    const right = normalizeEventRange(b);
    if (left.isAllDayLike !== right.isAllDayLike) {
      return left.isAllDayLike ? -1 : 1;
    }
    if (left.start.getTime() !== right.start.getTime()) {
      return left.start.getTime() - right.start.getTime();
    }
    return left.end.getTime() - right.end.getTime();
  });

export function CalendarPage() {
  const navigate = useNavigate();
  const { isAuthenticated, isAuthReady } = useAuthStore();
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [calendars, setCalendars] = useState<Calendar[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [viewMode, setViewMode] = useState<'month' | 'week' | 'day'>('month');
  const [isCalendarPickerOpen, setIsCalendarPickerOpen] = useState(false);
  const [selectedCalendars, setSelectedCalendars] = useState<string[]>([]);
  const [isTimetableModalOpen, setIsTimetableModalOpen] = useState(false);
  const [timetableFile, setTimetableFile] = useState<File | null>(null);
  const [timetablePreview, setTimetablePreview] = useState<string | null>(null);
  const [repeatStartDate, setRepeatStartDate] = useState('');
  const [repeatEndDate, setRepeatEndDate] = useState('');
  const [analyzingTimetable, setAnalyzingTimetable] = useState(false);
  const [deletingTimetable, setDeletingTimetable] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(
    null,
  );
  const loadRange = getCalendarLoadRange(currentDate);
  const loadRangeKey = `${loadRange.start.getTime()}-${loadRange.end.getTime()}`;

  useEffect(() => {
    if (isAuthReady && !isAuthenticated) {
      navigate({ to: '/auth/login' });
      return;
    }
    if (isAuthenticated) {
      loadCalendars();
    }
  }, [isAuthenticated, isAuthReady, navigate]);

  useEffect(() => {
    if (selectedCalendars.length > 0) {
      loadCalendarEvents();
    }
  }, [loadRangeKey, selectedCalendars]);

  const loadCalendars = async () => {
    try {
      const response = await calendarApi.getCalendars();
      let nextCalendars = response.data ?? [];
      if (nextCalendars.length === 0) {
        const syncResponse = await calendarApi.syncCalendar();
        if (syncResponse.error) {
          throw new Error(syncResponse.error);
        }
        if (syncResponse.data && 'calendars' in syncResponse.data) {
          nextCalendars = syncResponse.data.calendars ?? [];
        }
      }
      const sorted = [...nextCalendars].sort((a, b) => {
        if (a.isPrimary === b.isPrimary) {
          return a.title.localeCompare(b.title);
        }
        return a.isPrimary ? -1 : 1;
      });
      setCalendars(sorted);
      setSelectedCalendars(sorted.map((cal: Calendar) => cal.id));
    } catch (error) {
      console.error('Error loading calendars:', error);
      toast.error('캘린더 목록을 불러오는데 실패했습니다.');
    }
  };

  const loadCalendarEvents = async () => {
    try {
      setLoading(true);
      const { start, end } = getCalendarLoadRange(currentDate);
      const response = await calendarApi.getEvents(start, end);
      // 필터링된 이벤트만 표시
      const filtered = (response.data || []).filter((event: any) =>
        selectedCalendars.includes(event.calendarId),
      );
      setEvents(filtered);
    } catch (error) {
      console.error('Error loading calendar:', error);
      toast.error('캘린더 로드에 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const handleSyncCalendar = async () => {
    setLoading(true);
    setIsSyncing(true);
    try {
      const { start, end } = getRangeForView(currentDate, viewMode);
      const response = await calendarApi.syncCalendar(start, end);

      if (response.error) {
        toast.error(`캘린더 동기화 실패: ${response.error}`);
        setLoading(false);
        return;
      }

      if (response.data?.skipped) {
        toast.message('동기화가 너무 빈번해 잠시 건너뛰었습니다.');
      } else {
        if (
          response.data &&
          'shareLinksRefreshed' in response.data &&
          response.data.shareLinksRefreshed
        ) {
          toast.success('캘린더가 동기화되었습니다. 공유 링크도 업데이트되었습니다.');
        } else {
          toast.success('캘린더가 동기화되었습니다.');
        }
      }

      // 동기화 후 캘린더와 이벤트 다시 로드
      await loadCalendars();
      await loadCalendarEvents();
    } catch (error) {
      console.error('Error syncing calendar:', error);
      toast.error('캘린더 동기화에 실패했습니다.');
    } finally {
      setLoading(false);
      setIsSyncing(false);
    }
  };

  const toggleCalendar = (calendarId: string) => {
    setSelectedCalendars((prev) =>
      prev.includes(calendarId)
        ? prev.filter((id) => id !== calendarId)
        : [...prev, calendarId],
    );
  };

  const openEventDetail = (event: CalendarEvent) => {
    setSelectedEvent(event);
  };

  const closeEventDetail = () => {
    setSelectedEvent(null);
  };

  const handleTimetableFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      setTimetableFile(null);
      setTimetablePreview(null);
      return;
    }
    if (!file.type.startsWith('image/')) {
      toast.error('이미지 파일만 업로드할 수 있습니다.');
      return;
    }
    setTimetableFile(file);
    const reader = new FileReader();
    reader.onload = () => {
      setTimetablePreview(String(reader.result ?? ''));
    };
    reader.readAsDataURL(file);
  };

  const analyzeTimetableImage = async (file: File) => {
    const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error('Gemini API 키가 설정되지 않았습니다.');
    }
    const { base64, mimeType } = await fileToBase64(file);
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [
            {
              role: 'user',
              parts: [
                {
                  text: `너는 시간표 이미지를 읽어서 일정 목록으로 변환하는 도우미야.
아래 JSON 형식으로만 응답해줘. 설명이나 마크다운은 넣지 마.
{
  "events": [
    {
      "title": "과목명",
      "location": "장소(없으면 생략)",
      "weekday": 1,
      "startTime": "HH:mm",
      "endTime": "HH:mm"
    }
  ]
}
weekday는 ISO 기준 숫자(월=1 ... 일=7)로만 출력해.
시간은 24시간제 HH:mm으로 출력해.`,
                },
                {
                  inline_data: {
                    mime_type: mimeType,
                    data: base64,
                  },
                },
              ],
            },
          ],
          generationConfig: {
            temperature: 0.1,
          },
        }),
      },
    );
    if (!response.ok) {
      const message = await response.text();
      throw new Error(message || 'Gemini 응답 실패');
    }
    const data = (await response.json()) as {
      candidates?: Array<{
        content?: { parts?: Array<{ text?: string }> };
      }>;
    };
    const text =
      data.candidates?.[0]?.content?.parts?.map((part) => part.text).join('') ??
      '';
    const parsed = extractJsonFromText(text) as
      | { events: ExtractedScheduleEvent[] }
      | ExtractedScheduleEvent[];
    const events = Array.isArray(parsed) ? parsed : parsed.events;
    return (events ?? []).filter(Boolean);
  };

  const buildRecurringEvents = (extracted: ExtractedScheduleEvent[]) => {
    const unique = new Map<string, TimetableRecurringEvent>();
    extracted.forEach((event) => {
      const weekday = weekdayToNumber(event.weekday);
      if (!Number.isInteger(weekday) || weekday < 1 || weekday > 7) return;
      const start = parseTime(event.startTime);
      const end = parseTime(event.endTime);
      if (!start || !end) return;
      const startTime = `${String(start.hour).padStart(2, '0')}:${String(
        start.minute,
      ).padStart(2, '0')}`;
      const endTime = `${String(end.hour).padStart(2, '0')}:${String(
        end.minute,
      ).padStart(2, '0')}`;
      const key = [
        event.title.trim(),
        event.location?.trim() ?? '',
        String(weekday),
        startTime,
        endTime,
      ].join('|');
      unique.set(key, {
        title: event.title.trim(),
        location: event.location?.trim() || undefined,
        weekday,
        startTime,
        endTime,
      });
    });
    return Array.from(unique.values());
  };

  const handleAnalyzeAndSave = async () => {
    if (!isAuthenticated) {
      toast.error('로그인이 필요합니다.');
      return;
    }
    if (!timetableFile) {
      toast.error('시간표 이미지를 업로드해주세요.');
      return;
    }
    if (!repeatStartDate || !repeatEndDate) {
      toast.error('반복 시작일과 종료일을 입력해주세요.');
      return;
    }
    const { start, end } = normalizeDateRange(repeatStartDate, repeatEndDate);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      toast.error('유효한 날짜를 입력해주세요.');
      return;
    }
    if (end < start) {
      toast.error('종료일은 시작일 이후여야 합니다.');
      return;
    }

    try {
      setAnalyzingTimetable(true);
      const extracted = await analyzeTimetableImage(timetableFile);
      if (extracted.length === 0) {
        toast.error('일정을 추출하지 못했습니다.');
        return;
      }
      const generated = buildRecurringEvents(extracted);
      if (generated.length === 0) {
        toast.error('반복 일정이 생성되지 않았습니다.');
        return;
      }
      const response = await calendarApi.createTimetableEvents(generated, {
        startDate: start,
        endDate: end,
      });
      if (response.error) {
        toast.error(response.error);
        return;
      }
      toast.success('시간표 일정이 저장되었습니다.');
      setTimetableFile(null);
      setTimetablePreview(null);
      await calendarApi.syncCalendar(start, end);
      await loadCalendars();
      await loadCalendarEvents();
      setIsTimetableModalOpen(false);
    } catch (error) {
      console.error('Error analyzing timetable:', error);
      toast.error(
        error instanceof Error ? error.message : '시간표 분석에 실패했습니다.',
      );
    } finally {
      setAnalyzingTimetable(false);
    }
  };

  const handleDeleteTimetable = async () => {
    if (!repeatStartDate || !repeatEndDate) {
      toast.error('삭제할 기간을 먼저 입력해주세요.');
      return;
    }
    const { start, end } = normalizeDateRange(repeatStartDate, repeatEndDate);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      toast.error('유효한 날짜를 입력해주세요.');
      return;
    }
    if (end < start) {
      toast.error('종료일은 시작일 이후여야 합니다.');
      return;
    }
    const confirmed = window.confirm(
      '해당 기간의 업로드된 시간표 일정을 모두 삭제할까요?',
    );
    if (!confirmed) return;
    try {
      setDeletingTimetable(true);
      const response = await calendarApi.deleteTimetableEvents(start, end);
      if (response.error) {
        toast.error(response.error);
        return;
      }
      toast.success('시간표 일정이 삭제되었습니다.');
      await calendarApi.syncCalendar(start, end);
      await loadCalendars();
      await loadCalendarEvents();
      setIsTimetableModalOpen(false);
    } catch (error) {
      console.error('Error deleting timetable:', error);
      toast.error(
        error instanceof Error ? error.message : '시간표 삭제에 실패했습니다.',
      );
    } finally {
      setDeletingTimetable(false);
    }
  };

  const startOfDay = (date: Date) =>
    new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);
  const endOfDay = (date: Date) =>
    new Date(
      date.getFullYear(),
      date.getMonth(),
      date.getDate(),
      23,
      59,
      59,
      999,
    );
  const isSameDay = (left: Date, right: Date) =>
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate();

  const getEventsForDate = (date: Date) => {
    const dayStart = startOfDay(date);
    const dayEnd = endOfDay(date);
    const filtered = events.filter((event) => {
      const { start, end } = normalizeEventRange(event);
      return start <= dayEnd && end >= dayStart;
    });
    return sortEventsByStartWithAllDayFirst(filtered);
  };

  const today = new Date();
  const monthDays = useMemo(() => buildMonthDays(currentDate), [currentDate]);
  const weekDays = useMemo(() => buildWeekDays(currentDate), [currentDate]);
  const sidebarDate = viewMode === 'day' ? currentDate : today;
  const sidebarEvents = useMemo(
    () => getEventsForDate(sidebarDate),
    [events, sidebarDate],
  );
  const visibleCalendars = isCalendarPickerOpen
    ? calendars
    : calendars.slice(0, 6);
  const dayEvents = useMemo(
    () => splitEventsForDate(getEventsForDate(currentDate), currentDate),
    [events, currentDate],
  );
  const isSidebarToday = isSameDay(sidebarDate, today);

  return (
    <Layout disableHeaderHeight>
      <div className="mx-auto py-16">
        <div className="flex flex-col gap-4 mb-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <h1 className="text-2xl sm:text-3xl font-extrabold mb-2">
              내 캘린더
            </h1>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsTimetableModalOpen(true)}
              >
                <UploadCloud />
                에타 시간표 업로드
              </Button>
              <Button onClick={handleSyncCalendar} disabled={loading}>
                <motion.span
                  animate={isSyncing ? { rotate: 360 } : { rotate: 0 }}
                  transition={
                    isSyncing
                      ? { duration: 1, repeat: Infinity, ease: 'linear' }
                      : { duration: 0.2 }
                  }
                  className="inline-flex"
                >
                  <RefreshCw />
                </motion.span>
                {isSyncing ? '동기화 중...' : '캘린더 동기화'}
              </Button>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <button
                onClick={() => setCurrentDate(new Date())}
                className="px-3 py-1.5 border border-gray-200 rounded hover:border-gray-400 text-xs sm:text-sm"
              >
                오늘
              </button>
              <button
                onClick={() => setViewMode('month')}
                className={`px-3 py-1.5 border rounded text-xs sm:text-sm ${
                  viewMode === 'month'
                    ? 'border-gray-900 text-gray-900'
                    : 'border-gray-200 text-gray-600 hover:border-gray-400'
                }`}
              >
                월간
              </button>
              <button
                onClick={() => setViewMode('week')}
                className={`px-3 py-1.5 border rounded text-xs sm:text-sm ${
                  viewMode === 'week'
                    ? 'border-gray-900 text-gray-900'
                    : 'border-gray-200 text-gray-600 hover:border-gray-400'
                }`}
              >
                주간
              </button>
              <button
                onClick={() => setViewMode('day')}
                className={`px-3 py-1.5 border rounded text-xs sm:text-sm ${
                  viewMode === 'day'
                    ? 'border-gray-900 text-gray-900'
                    : 'border-gray-200 text-gray-600 hover:border-gray-400'
                }`}
              >
                일간
              </button>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() =>
                  setCurrentDate(getPreviousDate(currentDate, viewMode))
                }
                className="px-3 py-1.5 border border-gray-200 rounded hover:border-gray-400 text-xs sm:text-sm"
              >
                ← 이전
              </button>
              <div className="text-xs sm:text-sm font-semibold text-gray-700">
                {formatHeaderLabel(currentDate, viewMode)}
              </div>
              <button
                onClick={() =>
                  setCurrentDate(getNextDate(currentDate, viewMode))
                }
                className="px-3 py-1.5 border border-gray-200 rounded hover:border-gray-400 text-xs sm:text-sm"
              >
                다음 →
              </button>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-12">
          {/* 캘린더 */}
          <div className="lg:col-span-2 rounded-lg">
            {viewMode === 'month' && (
              <div className="grid grid-cols-7 gap-1.5 sm:gap-2">
                {['일', '월', '화', '수', '목', '금', '토'].map((day) => (
                  <div
                    key={day}
                    className="text-center font-semibold text-gray-600 p-2 text-xs sm:text-sm"
                  >
                    {day}
                  </div>
                ))}
                {monthDays.map((day, index) => {
                  if (!day) {
                    return (
                      <div
                        key={index}
                        className="min-h-20 sm:min-h-24 border border-gray-100 rounded-md bg-gray-50"
                      />
                    );
                  }
                  const dayEvents = getEventsForDate(day);
                  return (
                    <button
                      key={index}
                      type="button"
                      onClick={() => {
                        setCurrentDate(day);
                        setViewMode('day');
                      }}
                      className={`group relative min-h-20 sm:min-h-24 border rounded-md p-1.5 sm:p-2 text-left hover:border-gray-400 transition-colors flex flex-col ${
                        isSameDay(day, today)
                          ? 'border-gray-900'
                          : 'border-gray-200'
                      }`}
                    >
                      <span className="text-xs sm:text-sm font-medium text-gray-700">
                        {day.getDate()}
                      </span>
                      <div className="mt-2 space-y-1">
                        {dayEvents.slice(0, 3).map((event) => (
                          <div
                            key={event.id}
                            className="text-[11px] sm:text-xs px-2 py-1 rounded-md truncate text-white shadow-sm"
                            style={{
                              backgroundColor: event.calendarColor || '#999999',
                            }}
                            title={event.title}
                          >
                            {event.isAllDay
                              ? event.title
                              : `${new Date(event.startTime).toLocaleTimeString(
                                  'ko-KR',
                                  { hour: '2-digit', minute: '2-digit' },
                                )} ${event.title}`}
                          </div>
                        ))}
                        {dayEvents.length > 3 && (
                          <div className="text-[11px] sm:text-xs text-gray-500 px-1">
                            +{dayEvents.length - 3}개
                          </div>
                        )}
                      </div>
                      <div className="pointer-events-none invisible absolute left-1/2 top-8 z-20 w-56 -translate-x-1/2 rounded-lg border border-gray-200 bg-white p-3 text-xs text-gray-700 shadow-lg opacity-0 transition duration-150 group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100">
                        <div className="mb-2 text-[11px] font-semibold text-gray-600">
                          {day.toLocaleDateString('ko-KR', {
                            month: 'long',
                            day: 'numeric',
                            weekday: 'short',
                          })}
                        </div>
                        {dayEvents.length === 0 ? (
                          <div className="text-[11px] text-gray-500">
                            일정 없음
                          </div>
                        ) : (
                          <div className="space-y-1">
                            {dayEvents.slice(0, 5).map((event) => (
                              <div
                                key={`hover-${event.id}`}
                                className="flex items-center gap-2 text-[11px]"
                              >
                                <span
                                  className="h-2 w-2 rounded-full"
                                  style={{
                                    backgroundColor:
                                      event.calendarColor || '#999999',
                                  }}
                                />
                                <span className="flex-1 truncate">
                                  {event.isAllDay
                                    ? event.title
                                    : `${new Date(
                                        event.startTime,
                                      ).toLocaleTimeString('ko-KR', {
                                        hour: '2-digit',
                                        minute: '2-digit',
                                      })} ${event.title}`}
                                </span>
                              </div>
                            ))}
                            {dayEvents.length > 5 && (
                              <div className="text-[10px] text-gray-500 pt-1">
                                +{dayEvents.length - 5}개 더 있음
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}

            {viewMode === 'week' && (
              <div className="overflow-x-auto">
                <div className="min-w-[720px] border border-gray-200 rounded-lg overflow-hidden">
                  <div className="grid grid-cols-8 bg-gray-50 border-b border-gray-200">
                    <div className="p-3 text-xs text-gray-500">시간</div>
                    {weekDays.map((date) => (
                      <div
                        key={date.toISOString()}
                        className={`p-3 text-sm font-semibold ${
                          isSameDay(date, today)
                            ? 'text-gray-900'
                            : 'text-gray-600'
                        }`}
                      >
                        {date.toLocaleDateString('ko-KR', {
                          weekday: 'short',
                          month: 'short',
                          day: 'numeric',
                        })}
                      </div>
                    ))}
                  </div>

                  <div className="grid grid-cols-8 border-b border-gray-200">
                    <div className="p-3 text-xs text-gray-400">종일</div>
                    {weekDays.map((date) => {
                      const { allDayEvents } = splitEventsForDate(
                        getEventsForDate(date),
                        date,
                      );
                      return (
                        <div
                          key={date.toISOString()}
                          className="p-2 border-l border-gray-100"
                        >
                          {allDayEvents.length === 0 ? (
                            <p className="text-xs text-gray-400">없음</p>
                          ) : (
                            <div className="flex flex-wrap gap-1">
                              {allDayEvents.map((event) => (
                                <button
                                  key={event.id}
                                  type="button"
                                  onClick={() => openEventDetail(event)}
                                  className="text-[11px] px-2 py-1 rounded-full text-white shadow-sm hover:opacity-90"
                                  style={{
                                    backgroundColor:
                                      event.calendarColor || '#999999',
                                  }}
                                  title={event.title}
                                >
                                  {event.title}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  <div className="grid grid-cols-8">
                    <div className="relative border-r border-gray-200">
                      {HOURS.map((hour) => (
                        <div
                          key={`time-${hour}`}
                          className="text-xs text-gray-400 px-3"
                          style={{ height: HOUR_HEIGHT }}
                        >
                          {formatHourLabel(hour)}
                        </div>
                      ))}
                    </div>
                    {weekDays.map((date) => {
                      const { timedEvents } = splitEventsForDate(
                        getEventsForDate(date),
                        date,
                      );
                      return (
                        <div
                          key={date.toISOString()}
                          className="relative border-l border-gray-100"
                          style={{ height: HOUR_HEIGHT * 24 }}
                        >
                          {HOURS.map((hour) => (
                            <div
                              key={`grid-${date.toISOString()}-${hour}`}
                              className="absolute left-0 right-0 border-t border-gray-100"
                              style={{ top: hour * HOUR_HEIGHT }}
                            />
                          ))}
                          {timedEvents.map((event) => {
                            const { top, height } = getEventPosition(
                              event,
                              date,
                            );
                            return (
                              <div
                                key={event.id}
                                role="button"
                                tabIndex={0}
                                onClick={() => openEventDetail(event)}
                                onKeyDown={(eventKey) => {
                                  if (eventKey.key === 'Enter') {
                                    openEventDetail(event);
                                  }
                                }}
                                className="absolute left-1 right-1 cursor-pointer rounded-lg px-2 py-1 text-[11px] text-white shadow-sm hover:opacity-90"
                                style={{
                                  top,
                                  height,
                                  backgroundColor:
                                    event.calendarColor || '#999999',
                                }}
                                title={event.title}
                              >
                                <div className="font-semibold truncate">
                                  {event.title}
                                </div>
                                <div className="text-[10px] opacity-90">
                                  {formatEventTimeLabel(event, date)}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {viewMode === 'day' && (
              <div className="overflow-x-auto">
                <div className="min-w-[520px] border border-gray-200 rounded-lg overflow-hidden">
                  <div className="flex items-start gap-4 p-4 border-b border-gray-200">
                    <div className="text-xs text-gray-400 w-12">종일</div>
                    <div className="flex-1">
                      {dayEvents.allDayEvents.length === 0 ? (
                        <p className="text-xs text-gray-400">
                          종일 일정이 없습니다.
                        </p>
                      ) : (
                        <div className="flex flex-wrap gap-2">
                          {dayEvents.allDayEvents.map((event) => (
                            <button
                              key={event.id}
                              type="button"
                              onClick={() => openEventDetail(event)}
                              className="text-xs px-2 py-1 rounded-full text-white shadow-sm hover:opacity-90"
                              style={{
                                backgroundColor:
                                  event.calendarColor || '#999999',
                              }}
                            >
                              {event.title}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-[64px_1fr]">
                    <div className="border-r border-gray-200">
                      {HOURS.map((hour) => (
                        <div
                          key={`day-time-${hour}`}
                          className="text-xs text-gray-400 px-3"
                          style={{ height: HOUR_HEIGHT }}
                        >
                          {formatHourLabel(hour)}
                        </div>
                      ))}
                    </div>
                    <div
                      className="relative"
                      style={{ height: HOUR_HEIGHT * 24 }}
                    >
                      {HOURS.map((hour) => (
                        <div
                          key={`day-grid-${hour}`}
                          className="absolute left-0 right-0 border-t border-gray-100"
                          style={{ top: hour * HOUR_HEIGHT }}
                        />
                      ))}
                      {dayEvents.timedEvents.length === 0 && (
                        <div className="absolute inset-0 flex items-center justify-center text-sm text-gray-400">
                          일정이 없습니다.
                        </div>
                      )}
                      {dayEvents.timedEvents.map((event) => {
                        const { top, height } = getEventPosition(
                          event,
                          currentDate,
                        );
                        return (
                          <div
                            key={event.id}
                            role="button"
                            tabIndex={0}
                            onClick={() => openEventDetail(event)}
                            onKeyDown={(eventKey) => {
                              if (eventKey.key === 'Enter') {
                                openEventDetail(event);
                              }
                            }}
                            className="absolute left-2 right-2 cursor-pointer rounded-lg px-3 py-2 text-xs text-white shadow-sm hover:opacity-90"
                            style={{
                              top,
                              height,
                              backgroundColor: event.calendarColor || '#999999',
                            }}
                            title={event.title}
                          >
                            <div className="font-semibold truncate">
                              {event.title}
                            </div>
                            <div className="text-[11px] opacity-90">
                              {formatEventTimeLabel(event, currentDate)}
                            </div>
                            {event.calendarTitle && (
                              <div className="text-[10px] opacity-80 truncate">
                                {event.calendarTitle}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* 이벤트 목록 */}
          <div className="rounded-lg">
            <h3 className="text-base sm:text-lg font-semibold mb-4">
              {viewMode === 'day'
                ? currentDate.toLocaleDateString('ko-KR', {
                    month: 'long',
                    day: 'numeric',
                  })
                : today.toLocaleDateString('ko-KR', {
                    month: 'long',
                    day: 'numeric',
                  })}
              {viewMode === 'day' ? ' 일정' : ' 오늘 일정'}
            </h3>
            <div className="space-y-3">
              {sidebarEvents.length > 0 ? (
                sidebarEvents.slice(0, 10).map((event) => (
                  <div
                    key={event.id}
                    className={`p-3 border border-gray-200 rounded-md ${
                      isSidebarToday &&
                      normalizeEventRange(event).end.getTime() < Date.now()
                        ? 'bg-gray-50'
                        : 'bg-white'
                    }`}
                  >
                    <div className="flex items-start gap-2">
                      {event.calendarColor && (
                        <div
                          className="w-2 h-2 mt-1.5 rounded-full flex-shrink-0"
                          style={{ backgroundColor: event.calendarColor }}
                        />
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm truncate">
                          {event.title}
                        </p>
                        <p className="text-xs text-gray-500 mt-1">
                          {event.isAllDay
                            ? '하루 종일'
                            : new Date(event.startTime).toLocaleTimeString(
                                'ko-KR',
                                {
                                  hour: '2-digit',
                                  minute: '2-digit',
                                },
                              )}
                        </p>
                        {event.calendarTitle && (
                          <p className="text-xs text-gray-400 mt-0.5">
                            {event.calendarTitle}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-gray-500 text-sm">
                  {viewMode === 'day'
                    ? '해당 날짜 일정이 없습니다.'
                    : '오늘 일정이 없습니다.'}
                </p>
              )}
            </div>

            {calendars.length > 0 && (
              <div className="mt-8 border-t border-gray-100 pt-6">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-sm font-semibold">캘린더 선택</h4>
                  {calendars.length > 6 && (
                    <button
                      type="button"
                      onClick={() => setIsCalendarPickerOpen((prev) => !prev)}
                      className="text-xs font-semibold text-gray-500 flex items-center gap-1"
                    >
                      {isCalendarPickerOpen ? '접기' : '더보기'}
                      <span>
                        {isCalendarPickerOpen ? <ChevronUp /> : <ChevronDown />}
                      </span>
                    </button>
                  )}
                </div>
                <div className="space-y-2">
                  {visibleCalendars.map((calendar) => (
                    <label
                      key={calendar.id}
                      className="flex items-center gap-2 cursor-pointer text-sm"
                    >
                      <Checkbox
                        id={`calendar-${calendar.id}`}
                        checked={selectedCalendars.includes(calendar.id)}
                        onCheckedChange={() => toggleCalendar(calendar.id)}
                        style={
                          calendar.color
                            ? ({
                                '--checkbox-color': calendar.color,
                              } as React.CSSProperties)
                            : undefined
                        }
                      />
                      <div className="flex items-center gap-2">
                        <span className="text-gray-700">
                          {calendar.title}
                          {calendar.isPrimary && (
                            <span className="text-xs text-gray-400 ml-1">
                              (기본)
                            </span>
                          )}
                        </span>
                      </div>
                    </label>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
      {selectedEvent && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
          onClick={closeEventDetail}
        >
          <div
            className="w-full max-w-md rounded-xl bg-white shadow-xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div
              className="rounded-t-xl px-5 py-4 text-white"
              style={{
                backgroundColor: selectedEvent.calendarColor || '#999999',
              }}
            >
              <div className="flex items-start justify-between gap-4">
                <h3 className="text-lg font-semibold">{selectedEvent.title}</h3>
                <button
                  type="button"
                  className="text-sm text-white/80 hover:text-white"
                  onClick={closeEventDetail}
                >
                  닫기
                </button>
              </div>
              {selectedEvent.calendarTitle && (
                <p className="mt-1 text-xs text-white/80">
                  {selectedEvent.calendarTitle}
                </p>
              )}
            </div>
            <div className="px-5 py-4 text-sm text-gray-700">
              <div className="flex items-center justify-between py-2">
                <span className="text-gray-500">시간</span>
                <span>
                  {selectedEvent.isAllDay
                    ? '하루 종일'
                    : `${new Date(selectedEvent.startTime).toLocaleString(
                        'ko-KR',
                      )} ~ ${new Date(selectedEvent.endTime).toLocaleString(
                        'ko-KR',
                      )}`}
                </span>
              </div>
              <div className="flex items-center justify-between py-2">
                <span className="text-gray-500">일정 종류</span>
                <span>{selectedEvent.isBusy ? '바쁨' : '여유'}</span>
              </div>
              <div className="flex items-start justify-between gap-4 py-2">
                <span className="text-gray-500">장소</span>
                <span className="text-right">
                  {selectedEvent.location || '없음'}
                </span>
              </div>
              <div className="flex items-start justify-between gap-4 py-2">
                <span className="text-gray-500">설명</span>
                <span className="text-right whitespace-pre-wrap">
                  {selectedEvent.description || '없음'}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}
      {isTimetableModalOpen && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4"
          role="dialog"
          aria-modal="true"
          onClick={() => setIsTimetableModalOpen(false)}
        >
          <div
            className="h-full w-full max-w-3xl overflow-hidden rounded-2xl bg-white shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4">
              <h2 className="text-lg font-semibold">
                에브리타임 시간표 업로드
              </h2>
              <button
                type="button"
                className="text-sm text-gray-500 hover:text-gray-800"
                onClick={() => setIsTimetableModalOpen(false)}
              >
                닫기
              </button>
            </div>
            <div className="h-full overflow-y-auto px-5 py-4">
              <div className="space-y-4">
                <div>
                  <label className="text-sm font-semibold block mb-2">
                    시간표 이미지
                  </label>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleTimetableFileChange}
                    className="w-full text-sm"
                  />
                </div>
                {timetablePreview && (
                  <img
                    src={timetablePreview}
                    alt="업로드한 시간표 미리보기"
                    className="w-full rounded-lg border border-gray-200"
                  />
                )}
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <label className="text-xs text-gray-500">
                    시작일
                    <input
                      type="date"
                      value={repeatStartDate}
                      onChange={(event) =>
                        setRepeatStartDate(event.target.value)
                      }
                      className="mt-1 w-full rounded-md border border-gray-200 px-3 py-2 text-sm"
                    />
                  </label>
                  <label className="text-xs text-gray-500">
                    종료일
                    <input
                      type="date"
                      value={repeatEndDate}
                      onChange={(event) => setRepeatEndDate(event.target.value)}
                      className="mt-1 w-full rounded-md border border-gray-200 px-3 py-2 text-sm"
                    />
                  </label>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    onClick={handleAnalyzeAndSave}
                    disabled={analyzingTimetable || deletingTimetable}
                  >
                    <SaveAll />
                    {analyzingTimetable ? '분석 중...' : '분석 후 저장'}
                  </Button>
                  <Button
                    type="button"
                    variant="destructive"
                    onClick={handleDeleteTimetable}
                    disabled={analyzingTimetable || deletingTimetable}
                  >
                    <Trash />
                    {deletingTimetable ? '삭제 중...' : '시간표 삭제'}
                  </Button>
                </div>
                <p className="text-xs text-gray-500 mb-16">
                  삭제는 입력한 기간 내의 에브리타임 시간표만 제거합니다. 시간표
                  추가 또는 삭제 후에는 꼭 동기화를 다시 진행해 주세요!
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}

const getCalendarLoadRange = (date: Date) => {
  const monthStart = new Date(
    date.getFullYear(),
    date.getMonth(),
    1,
    0,
    0,
    0,
    0,
  );
  const monthEnd = new Date(
    date.getFullYear(),
    date.getMonth() + 1,
    0,
    23,
    59,
    59,
    999,
  );
  const weekStart = new Date(date);
  weekStart.setDate(weekStart.getDate() - weekStart.getDay());
  weekStart.setHours(0, 0, 0, 0);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 6);
  weekEnd.setHours(23, 59, 59, 999);
  const start = weekStart < monthStart ? weekStart : monthStart;
  const end = weekEnd > monthEnd ? weekEnd : monthEnd;
  return { start, end };
};

const getRangeForView = (date: Date, viewMode: 'month' | 'week' | 'day') => {
  if (viewMode === 'day') {
    return {
      start: new Date(
        date.getFullYear(),
        date.getMonth(),
        date.getDate(),
        0,
        0,
        0,
        0,
      ),
      end: new Date(
        date.getFullYear(),
        date.getMonth(),
        date.getDate(),
        23,
        59,
        59,
        999,
      ),
    };
  }
  if (viewMode === 'week') {
    const start = new Date(date);
    start.setDate(start.getDate() - start.getDay());
    const end = new Date(start);
    end.setDate(end.getDate() + 6);
    end.setHours(23, 59, 59, 999);
    start.setHours(0, 0, 0, 0);
    return { start, end };
  }
  const start = new Date(date.getFullYear(), date.getMonth(), 1, 0, 0, 0, 0);
  const end = new Date(
    date.getFullYear(),
    date.getMonth() + 1,
    0,
    23,
    59,
    59,
    999,
  );
  return { start, end };
};

const buildMonthDays = (date: Date) => {
  const daysInMonth = new Date(
    date.getFullYear(),
    date.getMonth() + 1,
    0,
  ).getDate();
  const firstDayOfWeek = new Date(
    date.getFullYear(),
    date.getMonth(),
    1,
  ).getDay();
  const days: Array<Date | null> = [];
  for (let i = 0; i < firstDayOfWeek; i += 1) {
    days.push(null);
  }
  for (let i = 1; i <= daysInMonth; i += 1) {
    days.push(new Date(date.getFullYear(), date.getMonth(), i));
  }
  return days;
};

const buildWeekDays = (date: Date) => {
  const start = new Date(date);
  start.setDate(start.getDate() - start.getDay());
  start.setHours(0, 0, 0, 0);
  return Array.from({ length: 7 }, (_, index) => {
    const next = new Date(start);
    next.setDate(start.getDate() + index);
    return next;
  });
};

const formatHeaderLabel = (date: Date, viewMode: 'month' | 'week' | 'day') => {
  if (viewMode === 'day') {
    return date.toLocaleDateString('ko-KR', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      weekday: 'short',
    });
  }
  if (viewMode === 'week') {
    const start = new Date(date);
    start.setDate(start.getDate() - start.getDay());
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    return `${start.toLocaleDateString('ko-KR', {
      month: 'long',
      day: 'numeric',
    })} - ${end.toLocaleDateString('ko-KR', {
      month: 'long',
      day: 'numeric',
    })}`;
  }
  return date.toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: 'long',
  });
};

const getPreviousDate = (date: Date, viewMode: 'month' | 'week' | 'day') => {
  if (viewMode === 'day') {
    const next = new Date(date);
    next.setDate(next.getDate() - 1);
    return next;
  }
  if (viewMode === 'week') {
    const next = new Date(date);
    next.setDate(next.getDate() - 7);
    return next;
  }
  return new Date(date.getFullYear(), date.getMonth() - 1, 1);
};

const getNextDate = (date: Date, viewMode: 'month' | 'week' | 'day') => {
  if (viewMode === 'day') {
    const next = new Date(date);
    next.setDate(next.getDate() + 1);
    return next;
  }
  if (viewMode === 'week') {
    const next = new Date(date);
    next.setDate(next.getDate() + 7);
    return next;
  }
  return new Date(date.getFullYear(), date.getMonth() + 1, 1);
};

const HOUR_HEIGHT = 64;
const HOURS = Array.from({ length: 24 }, (_, index) => index);
const MIN_EVENT_HEIGHT = 24;

const formatHourLabel = (hour: number) => {
  const period = hour < 12 ? '오전' : '오후';
  const display = hour % 12 === 0 ? 12 : hour % 12;
  return `${period} ${display}시`;
};

const splitEventsForDate = (events: CalendarEvent[], date: Date) => {
  const dayStart = new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
    0,
    0,
    0,
    0,
  );
  const dayEnd = new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
    23,
    59,
    59,
    999,
  );

  const allDayEvents: CalendarEvent[] = [];
  const timedEvents: CalendarEvent[] = [];

  events.forEach((event) => {
    const {
      start: eventStart,
      end: eventEnd,
      isAllDayLike,
    } = normalizeEventRange(event);
    const spansFullDay =
      isAllDayLike || (eventStart <= dayStart && eventEnd >= dayEnd);

    if (spansFullDay) {
      allDayEvents.push(event);
    } else {
      timedEvents.push(event);
    }
  });

  return { allDayEvents, timedEvents };
};

const getEventPosition = (event: CalendarEvent, date: Date) => {
  const dayStart = new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
    0,
    0,
    0,
    0,
  );
  const dayEnd = new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
    23,
    59,
    59,
    999,
  );
  const eventStart = new Date(event.startTime);
  const eventEnd = new Date(event.endTime);
  const clampedStart = eventStart < dayStart ? dayStart : eventStart;
  const clampedEnd = eventEnd > dayEnd ? dayEnd : eventEnd;
  const startMinutes = clampedStart.getHours() * 60 + clampedStart.getMinutes();
  const endMinutes = clampedEnd.getHours() * 60 + clampedEnd.getMinutes();
  const durationMinutes = Math.max(15, endMinutes - startMinutes);
  const top = (startMinutes / 60) * HOUR_HEIGHT;
  const height = Math.max(
    MIN_EVENT_HEIGHT,
    (durationMinutes / 60) * HOUR_HEIGHT,
  );
  return { top, height };
};

const formatEventTimeLabel = (event: CalendarEvent, date: Date) => {
  if (event.isAllDay) return '하루 종일';
  const dayStart = new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
    0,
    0,
    0,
    0,
  );
  const dayEnd = new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
    23,
    59,
    59,
    999,
  );
  const start = new Date(event.startTime);
  const end = new Date(event.endTime);
  const clampedStart = start < dayStart ? dayStart : start;
  const clampedEnd = end > dayEnd ? dayEnd : end;
  const format = (value: Date) =>
    value.toLocaleTimeString('ko-KR', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
  return `${format(clampedStart)} - ${format(clampedEnd)}`;
};
