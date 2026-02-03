import { useEffect, useMemo, useState } from 'react';

import { useNavigate } from '@tanstack/react-router';
import { ChevronDown, ChevronUp, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';

import { Layout } from '@/components';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { calendarApi } from '@/services/api/calendarApi';
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
  const endExclusive = isAllDayLike
    ? new Date(eventEnd.getTime() - 1)
    : eventEnd;
  return { start: eventStart, end: endExclusive, isAllDayLike };
};

export function CalendarPage() {
  const navigate = useNavigate();
  const { isAuthenticated, isAuthReady } = useAuthStore();
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [calendars, setCalendars] = useState<Calendar[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [viewMode, setViewMode] = useState<'month' | 'week' | 'day'>('month');
  const [isCalendarPickerOpen, setIsCalendarPickerOpen] = useState(false);
  const [selectedCalendars, setSelectedCalendars] = useState<string[]>([]);
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(
    null,
  );

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
  }, [currentDate, selectedCalendars, viewMode]);

  const loadCalendars = async () => {
    try {
      const response = await calendarApi.getCalendars();
      if (!response.data || response.data.length === 0) {
        await calendarApi.syncCalendar();
      }
      const refreshed = await calendarApi.getCalendars();
      const nextCalendars = refreshed.data ?? [];
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
      const { start, end } = getRangeForView(currentDate, viewMode);
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
        toast.success('캘린더가 동기화되었습니다.');
      }

      // 동기화 후 캘린더와 이벤트 다시 로드
      await loadCalendars();
      await loadCalendarEvents();
    } catch (error) {
      console.error('Error syncing calendar:', error);
      toast.error('캘린더 동기화에 실패했습니다.');
    } finally {
      setLoading(false);
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
    return events.filter((event) => {
      const { start, end } = normalizeEventRange(event);
      return start <= dayEnd && end >= dayStart;
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
  const visibleCalendars = isCalendarPickerOpen
    ? calendars
    : calendars.slice(0, 6);
  const dayEvents = useMemo(
    () => splitEventsForDate(getEventsForDate(currentDate), currentDate),
    [events, currentDate],
  );

  return (
    <Layout disableHeaderHeight>
      <div className="mx-auto py-16">
        <div className="flex flex-col gap-4 mb-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <h1 className="text-2xl sm:text-3xl font-extrabold mb-2">
              일정 관리
            </h1>
            <Button onClick={handleSyncCalendar} disabled={loading}>
              <RefreshCw />
              {loading ? '동기화 중...' : '캘린더 동기화'}
            </Button>
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
                    className="p-3 border border-gray-200 rounded-md"
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
    </Layout>
  );
}

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
