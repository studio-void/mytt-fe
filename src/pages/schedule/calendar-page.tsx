import { useEffect, useState } from 'react';

import { toast } from 'sonner';

import { Layout } from '@/components';
import { Button } from '@/components/ui/button';
import { calendarApi } from '@/services/api/calendarApi';

interface CalendarEvent {
  id: string;
  title: string;
  startTime: Date;
  endTime: Date;
  isAllDay: boolean;
  isBusy: boolean;
}

export function CalendarPage() {
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentDate, setCurrentDate] = useState(new Date());

  useEffect(() => {
    const loadCalendar = async () => {
      try {
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
          setEvents(response.data || []);
        }
      } catch (error) {
        console.error('Error loading calendar:', error);
        toast.error('캘린더 로드에 실패했습니다.');
      } finally {
        setLoading(false);
      }
    };

    loadCalendar();
  }, [currentDate]);

  const handleSyncCalendar = async () => {
    setLoading(true);
    try {
      const response = await calendarApi.syncCalendar();

      if (response.error) {
        toast.error(`캘린더 동기화 실패: ${response.error}`);
        setLoading(false);
        return;
      }

      toast.success('캘린더가 동기화되었습니다.');

      // 동기화 후 다시 로드
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
      const eventsResponse = await calendarApi.getEvents(firstDay, lastDay);
      setEvents(eventsResponse.data || []);
    } catch (error) {
      console.error('Error syncing calendar:', error);
      toast.error('캘린더 동기화에 실패했습니다.');
    } finally {
      setLoading(false);
    }
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

  return (
    <Layout>
      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-3xl font-bold">일정 관리</h1>
          <Button onClick={handleSyncCalendar} disabled={loading}>
            {loading ? '동기화 중...' : '캘린더 동기화'}
          </Button>
        </div>

        <div className="grid md:grid-cols-3 gap-6">
          {/* 캘린더 */}
          <div className="md:col-span-2 bg-white rounded-lg shadow-md p-6">
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
                className="px-3 py-1 bg-gray-200 rounded hover:bg-gray-300"
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
                className="px-3 py-1 bg-gray-200 rounded hover:bg-gray-300"
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
              {days.map((day, index) => (
                <div
                  key={index}
                  className="aspect-square bg-gray-50 rounded-md p-2 text-center"
                >
                  {day && <span className="text-sm font-medium">{day}</span>}
                </div>
              ))}
            </div>
          </div>

          {/* 이벤트 목록 */}
          <div className="bg-white rounded-lg shadow-md p-6">
            <h3 className="text-lg font-semibold mb-4">최근 일정</h3>
            <div className="space-y-3">
              {events.length > 0 ? (
                events.slice(0, 5).map((event) => (
                  <div
                    key={event.id}
                    className="p-3 bg-blue-50 rounded-md border-l-4 border-blue-500"
                  >
                    <p className="font-medium text-sm">{event.title}</p>
                    <p className="text-xs text-gray-600">
                      {new Date(event.startTime).toLocaleTimeString('ko-KR', {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </p>
                  </div>
                ))
              ) : (
                <p className="text-gray-500 text-sm">일정이 없습니다.</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}
