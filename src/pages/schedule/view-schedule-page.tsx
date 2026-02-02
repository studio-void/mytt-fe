import { useEffect, useMemo, useState } from 'react';

import { useNavigate, useParams } from '@tanstack/react-router';
import { toast } from 'sonner';

import { Layout } from '@/components';
import { sharingApi } from '@/services/api/sharingApi';
import { useAuthStore } from '@/store/useAuthStore';

interface ScheduleEvent {
  id: string;
  title?: string;
  startTime: string;
  endTime: string;
  description?: string;
  location?: string;
  isBusy: boolean;
  calendarTitle?: string;
  calendarColor?: string;
}

interface ScheduleData {
  userEmail: string;
  privacyLevel: string;
  audience: string;
  linkId: string;
  events: ScheduleEvent[];
}

export function ViewSchedulePage() {
  const { uid, id } = useParams({ strict: false }) as {
    uid?: string;
    id?: string;
  };
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const [loading, setLoading] = useState(true);
  const [schedule, setSchedule] = useState<ScheduleData | null>(null);
  const [events, setEvents] = useState<ScheduleEvent[]>([]);
  const [privacyLevel, setPrivacyLevel] = useState<string>('busy_only');
  const [accessDenied, setAccessDenied] = useState(false);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [viewMode, setViewMode] = useState<'month' | 'week' | 'day'>('month');
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    if (!uid || !id) {
      toast.error('유효하지 않은 링크입니다.');
      navigate({ to: '/' });
      return;
    }
    loadSchedule();
  }, [uid, id, user?.email]);

  useEffect(() => {
    const timer = setInterval(() => {
      setNow(new Date());
    }, 60000);
    return () => clearInterval(timer);
  }, []);

  const loadSchedule = async () => {
    try {
      setLoading(true);
      const response = await sharingApi.getSharedSchedule(
        String(uid),
        String(id),
        user?.email,
      );
      if (response.error === 'access_denied') {
        setAccessDenied(true);
        setSchedule(null);
        setEvents([]);
        return;
      }
      if (response.data) {
        setSchedule(response.data as ScheduleData);
        setEvents(response.data.events || []);
        setPrivacyLevel(response.data.privacyLevel || 'busy_only');
      }
    } catch (error) {
      console.error('Error loading schedule:', error);
      toast.error('일정을 불러오는데 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const getEventsForDate = (date: Date) => {
    const dayStart = startOfDay(date);
    const dayEnd = endOfDay(date);
    return events.filter((event) => {
      const eventStart = new Date(event.startTime);
      const eventEnd = new Date(event.endTime);
      return eventStart <= dayEnd && eventEnd >= dayStart;
    });
  };

  const today = new Date();
  const monthDays = useMemo(() => buildMonthDays(currentDate), [currentDate]);
  const weekDays = useMemo(() => buildWeekDays(currentDate), [currentDate]);
  const sidebarDate = viewMode === 'day' ? currentDate : today;
  const sidebarEvents = useMemo(
    () => getEventsForDate(sidebarDate),
    [events, sidebarDate],
  );
  const dayEvents = useMemo(
    () => splitEventsForDate(getEventsForDate(currentDate), currentDate),
    [events, currentDate],
  );
  const dayLayout = useMemo(
    () => layoutTimedEvents(dayEvents.timedEvents, currentDate),
    [dayEvents.timedEvents, currentDate],
  );

  if (loading) {
    return (
      <Layout>
        <div className="max-w-6xl mx-auto py-8">
          <div className="text-center">로딩 중...</div>
        </div>
      </Layout>
    );
  }

  if (accessDenied) {
    return (
      <Layout>
        <div className="max-w-4xl mx-auto py-8">
          <div className="text-center">
            <p className="text-lg font-semibold mb-2">접근이 제한되었습니다.</p>
            <p className="text-gray-500">
              이 일정은 지정된 사람만 볼 수 있습니다.
            </p>
          </div>
        </div>
      </Layout>
    );
  }

  if (!schedule) {
    return (
      <Layout>
        <div className="max-w-4xl mx-auto py-8">
          <div className="text-center">일정을 찾을 수 없습니다.</div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="flex flex-col gap-4 mb-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h1 className="text-3xl font-bold mb-1">
                {schedule.userEmail}님의 일정
              </h1>
              <p className="text-gray-600 text-sm">
                {privacyLevel === 'busy_only' && '바쁜 시간만 표시됩니다'}
                {privacyLevel === 'basic_info' && '기본 정보가 표시됩니다'}
                {privacyLevel === 'full_details' && '전체 정보가 공개됩니다'}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <button
                onClick={() => setCurrentDate(new Date())}
                className="px-3 py-1.5 border border-gray-200 rounded hover:border-gray-400 text-sm"
              >
                오늘
              </button>
              <button
                onClick={() => setViewMode('month')}
                className={`px-3 py-1.5 border rounded text-sm ${
                  viewMode === 'month'
                    ? 'border-gray-900 text-gray-900'
                    : 'border-gray-200 text-gray-600 hover:border-gray-400'
                }`}
              >
                월간
              </button>
              <button
                onClick={() => setViewMode('week')}
                className={`px-3 py-1.5 border rounded text-sm ${
                  viewMode === 'week'
                    ? 'border-gray-900 text-gray-900'
                    : 'border-gray-200 text-gray-600 hover:border-gray-400'
                }`}
              >
                주간
              </button>
              <button
                onClick={() => setViewMode('day')}
                className={`px-3 py-1.5 border rounded text-sm ${
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
                className="px-3 py-1.5 border border-gray-200 rounded hover:border-gray-400 text-sm"
              >
                ← 이전
              </button>
              <div className="text-sm font-semibold text-gray-700">
                {formatHeaderLabel(currentDate, viewMode)}
              </div>
              <button
                onClick={() => setCurrentDate(getNextDate(currentDate, viewMode))}
                className="px-3 py-1.5 border border-gray-200 rounded hover:border-gray-400 text-sm"
              >
                다음 →
              </button>
            </div>
          </div>
        </div>

        <div className="grid md:grid-cols-3 gap-6">
          <div className="md:col-span-2 rounded-lg p-6">
            {viewMode === 'month' && (
              <div className="grid grid-cols-7 gap-2">
                {['일', '월', '화', '수', '목', '금', '토'].map((day) => (
                  <div
                    key={day}
                    className="text-center font-semibold text-gray-600 p-2"
                  >
                    {day}
                  </div>
                ))}
                {monthDays.map((day, index) => {
                  if (!day) {
                    return (
                      <div
                        key={index}
                        className="min-h-24 border border-gray-100 rounded-md bg-gray-50"
                      />
                    );
                  }
                  const dayEventsForCell = getEventsForDate(day);
                  return (
                    <button
                      key={index}
                      type="button"
                      onClick={() => {
                        setCurrentDate(day);
                        setViewMode('day');
                      }}
                      className={`min-h-24 border rounded-md p-2 text-left hover:border-gray-400 transition-colors flex flex-col ${
                        isSameDay(day, today)
                          ? 'border-gray-900'
                          : 'border-gray-200'
                      }`}
                    >
                      <span className="text-sm font-medium text-gray-700">
                        {day.getDate()}
                      </span>
                      <div className="mt-2 space-y-1">
                        {dayEventsForCell.slice(0, 3).map((event) => (
                          <div
                            key={event.id}
                            className="text-xs px-2 py-1 rounded-md truncate text-white shadow-sm"
                            style={{
                              backgroundColor: getEventColor(event),
                            }}
                            title={event.title}
                          >
                            {event.isAllDay
                              ? event.title ?? '바쁜 시간'
                              : `${new Date(event.startTime).toLocaleTimeString(
                                  'ko-KR',
                                  { hour: '2-digit', minute: '2-digit' },
                                )} ${event.title ?? '바쁜 시간'}`}
                            {event.calendarTitle && (
                              <span className="opacity-90">
                                {' '}
                                · {event.calendarTitle}
                              </span>
                            )}
                          </div>
                        ))}
                        {dayEventsForCell.length > 3 && (
                          <div className="text-xs text-gray-500 px-1">
                            +{dayEventsForCell.length - 3}개
                          </div>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}

            {viewMode === 'week' && (
              <div className="border border-gray-200 rounded-lg overflow-hidden">
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
                              <span
                                key={event.id}
                                className="text-[11px] px-2 py-1 rounded-full text-white"
                                style={{
                                  backgroundColor: getEventColor(event),
                                }}
                                title={event.title}
                              >
                                {event.title}
                              </span>
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
                    const positionedEvents = layoutTimedEvents(timedEvents, date);
                    const nowTop = isSameDay(date, now)
                      ? getNowLineTop(now)
                      : null;
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
                        {nowTop !== null && (
                          <div
                            className="absolute left-0 right-0 z-10"
                            style={{ top: nowTop }}
                          >
                            <div className="absolute -left-1 w-2 h-2 rounded-full bg-red-500" />
                            <div className="h-px w-full bg-red-500" />
                          </div>
                        )}
                        {positionedEvents.map((positioned) => {
                          const { top, height, left, width, event } = positioned;
                          return (
                            <div
                              key={event.id}
                              className="absolute rounded-lg px-2 py-1 text-[11px] text-white shadow-sm"
                              style={{
                                top,
                                height,
                                left,
                                width,
                                backgroundColor: getEventColor(event),
                              }}
                              title={event.title}
                            >
                              <div className="font-semibold truncate">
                                {event.title}
                              </div>
                              <div className="text-[10px] opacity-90">
                                {formatEventTimeLabel(event, date)}
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
                    );
                  })}
                </div>
              </div>
            )}

            {viewMode === 'day' && (
              <div className="border border-gray-200 rounded-lg overflow-hidden">
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
                          <span
                            key={event.id}
                            className="text-xs px-2 py-1 rounded-full text-white"
                            style={{
                              backgroundColor: getEventColor(event),
                            }}
                          >
                            {event.title}
                          </span>
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
                    {isSameDay(currentDate, now) && (
                      <div
                        className="absolute left-0 right-0 z-10"
                        style={{ top: getNowLineTop(now) }}
                      >
                        <div className="absolute -left-1 w-2 h-2 rounded-full bg-red-500" />
                        <div className="h-px w-full bg-red-500" />
                      </div>
                    )}
                    {dayEvents.timedEvents.length === 0 && (
                      <div className="absolute inset-0 flex items-center justify-center text-sm text-gray-400">
                        일정이 없습니다.
                      </div>
                    )}
                    {dayLayout.map((positioned) => {
                      const { top, height, left, width, event } = positioned;
                      return (
                        <div
                          key={event.id}
                          className="absolute rounded-lg px-3 py-2 text-xs text-white shadow-sm"
                          style={{
                            top,
                            height,
                            left,
                            width,
                            backgroundColor: getEventColor(event),
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
            )}
          </div>

          <div className="rounded-lg p-6">
            <h3 className="text-lg font-semibold mb-4">
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
                    className="p-3 border border-gray-200 rounded-md"
                  >
                    <div className="flex items-start gap-2">
                      <div
                        className="w-2 h-2 mt-1.5 rounded-full flex-shrink-0"
                        style={{
                          backgroundColor: getEventColor(event),
                        }}
                      />
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
          </div>
        </div>
      </div>
    </Layout>
  );
}

const HOUR_HEIGHT = 64;
const HOURS = Array.from({ length: 24 }, (_, index) => index);
const MIN_EVENT_HEIGHT = 24;
const COLUMN_GAP = 6;
const EVENT_COLOR_POOL = [
  '#6366f1',
  '#0ea5e9',
  '#22c55e',
  '#f59e0b',
  '#ef4444',
  '#8b5cf6',
  '#14b8a6',
  '#f97316',
  '#10b981',
  '#eab308',
];

const startOfDay = (date: Date) =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);

const endOfDay = (date: Date) =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999);

const isSameDay = (left: Date, right: Date) =>
  left.getFullYear() === right.getFullYear() &&
  left.getMonth() === right.getMonth() &&
  left.getDate() === right.getDate();

const formatHourLabel = (hour: number) => {
  const period = hour < 12 ? '오전' : '오후';
  const display = hour % 12 === 0 ? 12 : hour % 12;
  return `${period} ${display}시`;
};

const splitEventsForDate = (events: ScheduleEvent[], date: Date) => {
  const dayStart = startOfDay(date);
  const dayEnd = endOfDay(date);

  const allDayEvents: ScheduleEvent[] = [];
  const timedEvents: ScheduleEvent[] = [];

  events.forEach((event) => {
    const eventStart = new Date(event.startTime);
    const eventEnd = new Date(event.endTime);
    const spansFullDay =
      event.isAllDay ||
      (eventStart <= dayStart && eventEnd >= dayEnd) ||
      (eventStart.getHours() === 0 && eventEnd.getHours() === 0);

    if (spansFullDay) {
      allDayEvents.push(event);
    } else {
      timedEvents.push(event);
    }
  });

  return { allDayEvents, timedEvents };
};

const getEventPosition = (event: ScheduleEvent, date: Date) => {
  const dayStart = startOfDay(date);
  const dayEnd = endOfDay(date);
  const eventStart = new Date(event.startTime);
  const eventEnd = new Date(event.endTime);
  const clampedStart = eventStart < dayStart ? dayStart : eventStart;
  const clampedEnd = eventEnd > dayEnd ? dayEnd : eventEnd;
  const startMinutes =
    clampedStart.getHours() * 60 + clampedStart.getMinutes();
  const endMinutes = clampedEnd.getHours() * 60 + clampedEnd.getMinutes();
  const durationMinutes = Math.max(15, endMinutes - startMinutes);
  const top = (startMinutes / 60) * HOUR_HEIGHT;
  const height = Math.max(
    MIN_EVENT_HEIGHT,
    (durationMinutes / 60) * HOUR_HEIGHT,
  );
  return { top, height };
};

const getEventMinutes = (event: ScheduleEvent, date: Date) => {
  const dayStart = startOfDay(date);
  const dayEnd = endOfDay(date);
  const eventStart = new Date(event.startTime);
  const eventEnd = new Date(event.endTime);
  const clampedStart = eventStart < dayStart ? dayStart : eventStart;
  const clampedEnd = eventEnd > dayEnd ? dayEnd : eventEnd;
  const startMinutes =
    clampedStart.getHours() * 60 + clampedStart.getMinutes();
  const endMinutes = clampedEnd.getHours() * 60 + clampedEnd.getMinutes();
  return {
    startMinutes,
    endMinutes: Math.max(startMinutes + 15, endMinutes),
  };
};

const layoutTimedEvents = (events: ScheduleEvent[], date: Date) => {
  const sorted = [...events]
    .map((event) => ({ event, ...getEventMinutes(event, date) }))
    .sort((a, b) => {
      if (a.startMinutes === b.startMinutes) {
        return a.endMinutes - b.endMinutes;
      }
      return a.startMinutes - b.startMinutes;
    });

  const positioned: Array<{
    event: ScheduleEvent;
    top: number;
    height: number;
    left: string;
    width: string;
  }> = [];

  let group: Array<typeof sorted[number]> = [];
  let groupEnd = -1;

  const flushGroup = () => {
    if (group.length === 0) return;
    const columns: number[] = [];
    const assignments = new Map<string, { col: number; cols: number }>();

    group.forEach((item) => {
      let colIndex = columns.findIndex((end) => item.startMinutes >= end);
      if (colIndex === -1) {
        colIndex = columns.length;
        columns.push(item.endMinutes);
      } else {
        columns[colIndex] = item.endMinutes;
      }
      assignments.set(item.event.id, { col: colIndex, cols: 0 });
    });

    const totalCols = columns.length;
    group.forEach((item) => {
      const assignment = assignments.get(item.event.id);
      if (!assignment) return;
      assignment.cols = totalCols;
    });

    group.forEach((item) => {
      const assignment = assignments.get(item.event.id);
      if (!assignment) return;
      const { top, height } = getEventPosition(item.event, date);
      const colWidth = 100 / assignment.cols;
      const left = `calc(${assignment.col * colWidth}% + ${COLUMN_GAP / 2}px)`;
      const width = `calc(${colWidth}% - ${COLUMN_GAP}px)`;
      positioned.push({
        event: item.event,
        top,
        height,
        left,
        width,
      });
    });

    group = [];
    groupEnd = -1;
  };

  sorted.forEach((item) => {
    if (group.length === 0) {
      group = [item];
      groupEnd = item.endMinutes;
      return;
    }
    if (item.startMinutes < groupEnd) {
      group.push(item);
      groupEnd = Math.max(groupEnd, item.endMinutes);
    } else {
      flushGroup();
      group = [item];
      groupEnd = item.endMinutes;
    }
  });

  flushGroup();
  return positioned;
};

const formatEventTimeLabel = (event: ScheduleEvent, date: Date) => {
  if (event.isAllDay) return '하루 종일';
  const dayStart = startOfDay(date);
  const dayEnd = endOfDay(date);
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

const getNowLineTop = (now: Date) => {
  const minutes = now.getHours() * 60 + now.getMinutes();
  return (minutes / 60) * HOUR_HEIGHT;
};

const getCalendarColor = (title?: string) => {
  if (!title) return '#9ca3af';
  let hash = 0;
  for (let i = 0; i < title.length; i += 1) {
    hash = (hash * 31 + title.charCodeAt(i)) % EVENT_COLOR_POOL.length;
  }
  return EVENT_COLOR_POOL[hash];
};

const getEventColor = (event: ScheduleEvent) =>
  event.calendarColor ||
  getCalendarColor(event.calendarTitle) ||
  (event.isBusy ? '#6366f1' : '#9ca3af');

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

const formatHeaderLabel = (
  date: Date,
  viewMode: 'month' | 'week' | 'day',
) => {
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

const getPreviousDate = (
  date: Date,
  viewMode: 'month' | 'week' | 'day',
) => {
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

const getNextDate = (
  date: Date,
  viewMode: 'month' | 'week' | 'day',
) => {
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
