import { addMonths } from 'date-fns';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  where,
  writeBatch,
} from 'firebase/firestore';

import { auth, db } from '@/services/firebase';

import { authApi } from './authApi';

const GOOGLE_CALENDAR_BASE = 'https://www.googleapis.com/calendar/v3';
const DEFAULT_RANGE_MONTHS = 3;
const MAX_BATCH_SIZE = 450;

interface GoogleCalendarListItem {
  id: string;
  summary: string;
  description?: string;
  timeZone?: string;
  accessRole?: string;
  primary?: boolean;
  backgroundColor?: string;
  foregroundColor?: string;
}

interface GoogleCalendarEventItem {
  id: string;
  summary?: string;
  description?: string;
  location?: string;
  start: { dateTime?: string; date?: string };
  end: { dateTime?: string; date?: string };
  transparency?: string;
  status?: string;
}

export interface StoredCalendar {
  id: string;
  title: string;
  description?: string;
  timeZone?: string;
  accessRole?: string;
  isPrimary: boolean;
  color?: string;
  foregroundColor?: string;
}

export interface StoredEvent {
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

const getRange = (startDate?: Date, endDate?: Date) => {
  const start = startDate ?? addMonths(new Date(), -DEFAULT_RANGE_MONTHS);
  const end = endDate ?? addMonths(new Date(), DEFAULT_RANGE_MONTHS);
  return { start, end };
};

const fetchGoogle = async <T>(
  path: string,
  token: string,
  params?: Record<string, string>,
) => {
  const url = new URL(`${GOOGLE_CALENDAR_BASE}${path}`);
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (value) url.searchParams.set(key, value);
    });
  }

  const response = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(
      message || `Google Calendar API error (${response.status})`,
    );
  }

  return (await response.json()) as T;
};

const encodeDocId = (value: string) =>
  encodeURIComponent(value).replace(/\./g, '%2E');

const chunkedBatchCommit = async (batches: Array<ReturnType<typeof writeBatch>>) => {
  for (const batch of batches) {
    await batch.commit();
  }
};

const stripUndefined = <T extends Record<string, unknown>>(value: T) =>
  Object.fromEntries(
    Object.entries(value).filter(([, entry]) => entry !== undefined),
  ) as T;

const mapCalendar = (calendar: GoogleCalendarListItem): StoredCalendar => ({
  id: calendar.id,
  title: calendar.summary,
  description: calendar.description,
  timeZone: calendar.timeZone,
  accessRole: calendar.accessRole,
  isPrimary: !!calendar.primary,
  color: calendar.backgroundColor,
  foregroundColor: calendar.foregroundColor,
});

const mapEvent = (
  event: GoogleCalendarEventItem,
  calendar: StoredCalendar,
): StoredEvent | null => {
  if (event.status === 'cancelled') return null;
  const startValue = event.start.dateTime ?? event.start.date;
  const endValue = event.end.dateTime ?? event.end.date;
  if (!startValue || !endValue) return null;

  const isAllDay = !!event.start.date && !event.start.dateTime;
  const startTime = new Date(startValue);
  const endTime = new Date(endValue);

  return {
    id: event.id,
    calendarId: calendar.id,
    title: event.summary || '(제목 없음)',
    description: event.description,
    location: event.location,
    startTime,
    endTime,
    isAllDay,
    isBusy: event.transparency !== 'transparent',
    calendarTitle: calendar.title,
    calendarColor: calendar.color,
  };
};

const fetchAllEvents = async (
  calendarId: string,
  token: string,
  start: Date,
  end: Date,
) => {
  const events: GoogleCalendarEventItem[] = [];
  let pageToken: string | undefined;
  do {
    const params: Record<string, string> = {
      timeMin: start.toISOString(),
      timeMax: end.toISOString(),
      singleEvents: 'true',
      orderBy: 'startTime',
      maxResults: '2500',
    };
    if (pageToken) params.pageToken = pageToken;

    const data = await fetchGoogle<{
      items: GoogleCalendarEventItem[];
      nextPageToken?: string;
    }>(`/calendars/${encodeURIComponent(calendarId)}/events`, token, params);
    events.push(...(data.items ?? []));
    pageToken = data.nextPageToken;
  } while (pageToken);

  return events;
};

export const calendarApi = {
  syncCalendar: async (startDate?: Date, endDate?: Date) => {
    try {
      if (!auth.currentUser) {
        return { error: '로그인이 필요합니다.' };
      }
      const token = await authApi.getGoogleAccessToken();
      const { start, end } = getRange(startDate, endDate);
      const calendarList = await fetchGoogle<{ items: GoogleCalendarListItem[] }>(
        '/users/me/calendarList',
        token,
      );
      const calendars = (calendarList.items ?? []).map(mapCalendar);

      const events: StoredEvent[] = [];
      for (const calendar of calendars) {
        const calendarEvents = await fetchAllEvents(
          calendar.id,
          token,
          start,
          end,
        );
        calendarEvents
          .map((event) => mapEvent(event, calendar))
          .filter((event): event is StoredEvent => !!event)
          .forEach((event) => events.push(event));
      }

      const batches: Array<ReturnType<typeof writeBatch>> = [];
      let batch = writeBatch(db);
      let batchCount = 0;

      const commitIfNeeded = () => {
        if (batchCount >= MAX_BATCH_SIZE) {
          batches.push(batch);
          batch = writeBatch(db);
          batchCount = 0;
        }
      };

      calendars.forEach((calendar) => {
        const calendarRef = doc(
          db,
          'users',
          auth.currentUser!.uid,
          'calendars',
          encodeDocId(calendar.id),
        );
        batch.set(
          calendarRef,
          stripUndefined({
            ...calendar,
            updatedAt: serverTimestamp(),
          }),
          { merge: true },
        );
        batchCount += 1;
        commitIfNeeded();
      });

      events.forEach((event) => {
        const eventRef = doc(
          db,
          'users',
          auth.currentUser!.uid,
          'events',
          encodeDocId(`${event.calendarId}__${event.id}`),
        );
        batch.set(
          eventRef,
          stripUndefined({
            ...event,
            startTime: Timestamp.fromDate(event.startTime),
            endTime: Timestamp.fromDate(event.endTime),
            updatedAt: serverTimestamp(),
          }),
          { merge: true },
        );
        batchCount += 1;
        commitIfNeeded();
      });

      batches.push(batch);
      await chunkedBatchCommit(batches);

      await setDoc(
        doc(db, 'users', auth.currentUser.uid),
        {
          calendarSync: {
            start: Timestamp.fromDate(start),
            end: Timestamp.fromDate(end),
            updatedAt: serverTimestamp(),
          },
        },
        { merge: true },
      );

      return {
        data: {
          calendars,
          eventsCount: events.length,
        },
      };
    } catch (error) {
      console.error('Calendar sync failed:', error);
      return {
        error: error instanceof Error ? error.message : '캘린더 동기화 실패',
      };
    }
  },

  getCalendars: async () => {
    if (!auth.currentUser) {
      return { data: [] as StoredCalendar[] };
    }
    const calendarsRef = collection(
      db,
      'users',
      auth.currentUser.uid,
      'calendars',
    );
    const snapshot = await getDocs(query(calendarsRef, orderBy('title')));
    const calendars = snapshot.docs.map((docSnap) => docSnap.data() as StoredCalendar);
    return { data: calendars };
  },

  getEvents: async (startDate: Date, endDate: Date) => {
    if (!auth.currentUser) {
      return { data: [] as StoredEvent[] };
    }
    const eventsRef = collection(
      db,
      'users',
      auth.currentUser.uid,
      'events',
    );
    const snapshot = await getDocs(
      query(
        eventsRef,
        where('startTime', '<=', Timestamp.fromDate(endDate)),
        orderBy('startTime'),
      ),
    );
    const events = snapshot.docs
      .map((docSnap) => {
      const data = docSnap.data() as Omit<StoredEvent, 'startTime' | 'endTime'> & {
        startTime: Timestamp;
        endTime: Timestamp;
      };
      return {
        ...data,
        startTime: data.startTime.toDate(),
        endTime: data.endTime.toDate(),
      } as StoredEvent;
    })
      .filter((event) => event.endTime >= startDate);
    return { data: events };
  },

  getEvent: async (eventId: string) => {
    if (!auth.currentUser) {
      return { data: null };
    }
    const eventRef = doc(
      db,
      'users',
      auth.currentUser.uid,
      'events',
      encodeDocId(eventId),
    );
    const snapshot = await getDoc(eventRef);
    return { data: snapshot.exists() ? snapshot.data() : null };
  },

  deleteEvent: async (eventId: string) => {
    if (!auth.currentUser) {
      return { error: '로그인이 필요합니다.' };
    }
    await deleteDoc(
      doc(db, 'users', auth.currentUser.uid, 'events', encodeDocId(eventId)),
    );
    return { data: true };
  },
};
