import { useEffect, useMemo, useState } from 'react';

import { useNavigate } from '@tanstack/react-router';
import { toast } from 'sonner';

import { Layout } from '@/components';
import { Button } from '@/components/ui/button';
import { calendarApi } from '@/services/api/calendarApi';
import { useAuthStore } from '@/store/useAuthStore';

interface CalendarEvent {
  id: string;
  calendarId: string;
  title: string;
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

export function CalendarPage() {
  const navigate = useNavigate();
  const { isAuthenticated, isAuthReady } = useAuthStore();
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [calendars, setCalendars] = useState<Calendar[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedCalendars, setSelectedCalendars] = useState<string[]>([]);

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
  }, [currentDate, selectedCalendars]);

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
      // 현재 월의 첫 날과 마지막 날 계산
      const firstDay = new Date(
        currentDate.getFullYear(),
        currentDate.getMonth(),
        1,
      );
      const lastDay = new Date(
        currentDate.getFullYear(),
        currentDate.getMonth() + 1,
        0,
      );

      const response = await calendarApi.getEvents(firstDay, lastDay);
      if (response.error) {
        console.error('Error loading calendar:', response.error);
        toast.error(`캘린더 로드 실패: ${response.error}`);
        setEvents([]);
      } else {
        // 필터링된 이벤트만 표시
        const filtered = (response.data || []).filter((event: any) =>
          selectedCalendars.includes(event.calendarId),
        );
        setEvents(filtered);
      }
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
      // 현재 보이는 달 범위로만 동기화하여 속도 개선
      const firstDay = new Date(
        currentDate.getFullYear(),
        currentDate.getMonth(),
        1,
      );
      const lastDay = new Date(
        currentDate.getFullYear(),
        currentDate.getMonth() + 1,
        0,
      );
      const response = await calendarApi.syncCalendar(firstDay, lastDay);

      if (response.error) {
        toast.error(`캘린더 동기화 실패: ${response.error}`);
        setLoading(false);
        return;
      }

      toast.success('캘린더가 동기화되었습니다.');

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

  const daysInMonth = new Date(
    currentDate.getFullYear(),
    currentDate.getMonth() + 1,
    0,
  ).getDate();
  const firstDayOfWeek = new Date(
    currentDate.getFullYear(),
    currentDate.getMonth(),
    1,
  ).getDay();
  const days = [];

  // 빈 셀 추가
  for (let i = 0; i < firstDayOfWeek; i++) {
    days.push(null);
  }

  // 날짜 추가
  for (let i = 1; i <= daysInMonth; i++) {
    days.push(i);
  }

  const getEventsForDate = (day: number | null) => {
    if (!day) return [];
    return events.filter((event) => {
      const eventStart = new Date(event.startTime);
      const eventEnd = new Date(event.endTime);
      const compareDate = new Date(
        currentDate.getFullYear(),
        currentDate.getMonth(),
        day,
      );
      const startOfDay = new Date(
        compareDate.getFullYear(),
        compareDate.getMonth(),
        compareDate.getDate(),
      );
      const endOfDay = new Date(
        compareDate.getFullYear(),
        compareDate.getMonth(),
        compareDate.getDate(),
        23,
        59,
        59,
        999,
      );
      return eventStart <= endOfDay && eventEnd >= startOfDay;
    });
  };

  const eventsByCalendar = useMemo(() => {
    return calendars.map((calendar) => ({
      calendar,
      events: events.filter((event) => event.calendarId === calendar.id),
    }));
  }, [calendars, events]);

  return (
    <Layout>
      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-3xl font-bold">일정 관리</h1>
          <Button onClick={handleSyncCalendar} disabled={loading}>
            {loading ? '동기화 중...' : '캘린더 동기화'}
          </Button>
        </div>

        {/* 캘린더 필터 */}
        {calendars.length > 0 && (
          <div className="mb-6 p-4 border border-gray-200 rounded-lg">
            <h3 className="text-sm font-semibold mb-3">캘린더 선택</h3>
            <div className="flex flex-wrap gap-3">
              {calendars.map((calendar) => (
                <label
                  key={calendar.id}
                  className="flex items-center gap-2 cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={selectedCalendars.includes(calendar.id)}
                    onChange={() => toggleCalendar(calendar.id)}
                    className="w-4 h-4"
                  />
                  <div className="flex items-center gap-2">
                    {calendar.color && (
                      <div
                        className="w-3 h-3 rounded-full"
                        style={{ backgroundColor: calendar.color }}
                      />
                    )}
                    <span className="text-sm">
                      {calendar.title}
                      {calendar.isPrimary && (
                        <span className="text-xs text-gray-500 ml-1">
                          (기본)
                        </span>
                      )}
                    </span>
                  </div>
                  {calendar.timeZone && (
                    <span className="text-xs text-gray-400">
                      {calendar.timeZone}
                    </span>
                  )}
                  {(calendar.description || calendar.accessRole) && (
                    <span className="text-xs text-gray-400">
                      {calendar.description || calendar.accessRole}
                    </span>
                  )}
                </label>
              ))}
            </div>
          </div>
        )}

        <div className="grid md:grid-cols-3 gap-6">
          {/* 캘린더 */}
          <div className="md:col-span-2 rounded-lg p-6">
            <div className="flex justify-between items-center mb-6">
              <button
                onClick={() =>
                  setCurrentDate(
                    new Date(
                      currentDate.getFullYear(),
                      currentDate.getMonth() - 1,
                    ),
                  )
                }
                className="px-3 py-1 border border-gray-200 rounded hover:border-gray-400"
              >
                ← 이전
              </button>
              <h2 className="text-xl font-semibold">
                {currentDate.toLocaleDateString('ko-KR', {
                  year: 'numeric',
                  month: 'long',
                })}
              </h2>
              <button
                onClick={() =>
                  setCurrentDate(
                    new Date(
                      currentDate.getFullYear(),
                      currentDate.getMonth() + 1,
                    ),
                  )
                }
                className="px-3 py-1 border border-gray-200 rounded hover:border-gray-400"
              >
                다음 →
              </button>
            </div>

            <div className="grid grid-cols-7 gap-2">
              {['일', '월', '화', '수', '목', '금', '토'].map((day) => (
                <div
                  key={day}
                  className="text-center font-semibold text-gray-600 p-2"
                >
                  {day}
                </div>
              ))}
              {days.map((day, index) => {
                const dayEvents = getEventsForDate(day);
                return (
                  <div
                    key={index}
                    className="min-h-24 border border-gray-200 rounded-md p-2 bg-white hover:bg-gray-50"
                  >
                    {day && (
                      <>
                        <span className="text-sm font-medium text-gray-700">
                          {day}
                        </span>
                        <div className="mt-1 space-y-1">
                          {dayEvents.slice(0, 3).map((event) => (
                            <div
                              key={event.id}
                              className="text-xs p-1 rounded truncate text-white"
                              style={{
                                backgroundColor:
                                  event.calendarColor || '#999999',
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
                            <div className="text-xs text-gray-500 px-1">
                              +{dayEvents.length - 3}개
                            </div>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* 이벤트 목록 */}
          <div className="rounded-lg p-6">
            <h3 className="text-lg font-semibold mb-4">
              {currentDate.toLocaleDateString('ko-KR', {
                month: 'long',
                day: 'numeric',
              })}
              의 일정
            </h3>
            <div className="space-y-3">
              {events.length > 0 ? (
                events
                  .filter(
                    (event) =>
                      new Date(event.startTime).getMonth() ===
                      currentDate.getMonth(),
                  )
                  .slice(0, 10)
                  .map((event) => (
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
                            {new Date(event.startTime).toLocaleTimeString(
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
                <p className="text-gray-500 text-sm">일정이 없습니다.</p>
              )}
            </div>

            {eventsByCalendar.length > 0 && (
              <div className="mt-8">
                <h4 className="text-sm font-semibold mb-3">캘린더별 요약</h4>
                <div className="space-y-2">
                  {eventsByCalendar.map(({ calendar, events }) => (
                    <div
                      key={calendar.id}
                      className="flex items-center justify-between text-sm"
                    >
                      <div className="flex items-center gap-2">
                        {calendar.color && (
                          <span
                            className="inline-block h-2.5 w-2.5 rounded-full"
                            style={{ backgroundColor: calendar.color }}
                          />
                        )}
                        <span className="text-gray-700">{calendar.title}</span>
                      </div>
                      <span className="text-gray-500">{events.length}개</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </Layout>
  );
}
