import { addMonths } from 'date-fns';
import {
  Timestamp,
  collection,
  collectionGroup,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  where,
  writeBatch,
} from 'firebase/firestore';

import { auth, db } from '@/services/firebase';

import { authApi } from './authApi';
import {
  getBucketIdsForRange,
  readBucketEvents,
  writeEventBuckets,
} from './eventBuckets';
import { meetingApi } from './meetingApi';
import { sharingApi } from './sharingApi';

const GOOGLE_CALENDAR_BASE = 'https://www.googleapis.com/calendar/v3';
const DEFAULT_RANGE_MONTHS = 2;
const MAX_BATCH_SIZE = 450;
const SYNC_COOLDOWN_MINUTES = 30;
const ENABLE_SYNC_COOLDOWN = false;

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

const MANUAL_CALENDAR_TITLE = 'MyTT';
const MANUAL_CALENDAR_DESCRIPTION = 'MyTT에서 생성한 에브리타임 시간표';

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

interface TimeBlock {
  startTime: string;
  endTime: string;
}

export interface TimetableRecurringEvent {
  title: string;
  location?: string;
  weekday: number;
  startTime: string;
  endTime: string;
}

const parseHourMinute = (value: string) => {
  const [hourPart, minutePart] = value.split(':');
  const hour = Number(hourPart);
  const minute = Number(minutePart ?? '0');
  if (
    Number.isNaN(hour) ||
    Number.isNaN(minute) ||
    hour < 0 ||
    hour > 23 ||
    minute < 0 ||
    minute > 59
  ) {
    return null;
  }
  return { hour, minute };
};

const isoWeekdayToRrule = (weekday: number) => {
  const byDay = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'][weekday - 1];
  return byDay ?? null;
};

const getFirstOccurrenceDate = (startDate: Date, weekday: number) => {
  const base = new Date(
    startDate.getFullYear(),
    startDate.getMonth(),
    startDate.getDate(),
    0,
    0,
    0,
    0,
  );
  const currentIsoWeekday = base.getDay() === 0 ? 7 : base.getDay();
  const offset = (weekday - currentIsoWeekday + 7) % 7;
  base.setDate(base.getDate() + offset);
  return base;
};

const toRruleUntilUtc = (date: Date) =>
  date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');

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

const fetchGoogleRequest = async <T>(
  path: string,
  token: string,
  init: RequestInit,
) => {
  const response = await fetch(`${GOOGLE_CALENDAR_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(
      message || `Google Calendar API error (${response.status})`,
    );
  }

  if (response.status === 204) return null as T;
  return (await response.json()) as T;
};

const encodeDocId = (value: string) =>
  encodeURIComponent(value).replace(/\./g, '%2E');

const chunkedBatchCommit = async (
  batches: Array<ReturnType<typeof writeBatch>>,
) => {
  for (const batch of batches) {
    await batch.commit();
  }
};

const stripUndefined = <T extends Record<string, unknown>>(value: T) =>
  Object.fromEntries(
    Object.entries(value).filter(([, entry]) => entry !== undefined),
  ) as T;

const parseDateOnly = (value: string) => {
  const [year, month, day] = value.split('-').map((part) => Number(part));
  if (!year || !month || !day) return new Date(value);
  return new Date(year, month - 1, day);
};

const ensureManualCalendarId = async (uid: string, token: string) => {
  const userRef = doc(db, 'users', uid);
  const userSnap = await getDoc(userRef);
  const storedId = userSnap.exists()
    ? (userSnap.data()?.manualCalendarId as string | undefined)
    : undefined;
  if (storedId) {
    try {
      await fetchGoogle(
        `/users/me/calendarList/${encodeDocId(storedId)}`,
        token,
      );
      return storedId;
    } catch {
      // ignore and recreate
    }
  }

  const created = await fetchGoogleRequest<{ id: string }>(
    '/calendars',
    token,
    {
      method: 'POST',
      body: JSON.stringify({
        summary: MANUAL_CALENDAR_TITLE,
        description: MANUAL_CALENDAR_DESCRIPTION,
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      }),
    },
  );

  await setDoc(
    userRef,
    {
      manualCalendarId: created.id,
      manualCalendarCreatedAt: serverTimestamp(),
    },
    { merge: true },
  );

  return created.id;
};

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
  const startTime = isAllDay ? parseDateOnly(startValue) : new Date(startValue);
  const endTime = isAllDay ? parseDateOnly(endValue) : new Date(endValue);

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

const buildBusyBlocksFromEvents = (
  events: StoredEvent[],
  start: Date,
  end: Date,
) =>
  events
    .filter(
      (event) =>
        event.isBusy && event.endTime.getTime() > start.getTime() &&
        event.startTime.getTime() < end.getTime(),
    )
    .map((event) => ({
      startTime: event.startTime.toISOString(),
      endTime: event.endTime.toISOString(),
    })) satisfies TimeBlock[];

const refreshGroupAvailabilityCache = async (
  uid: string,
  start: Date,
  end: Date,
  busyBlocks: TimeBlock[],
) => {
  const memberships = await getDocs(
    query(collectionGroup(db, 'members'), where('uid', '==', uid)),
  );
  const groupIds = Array.from(
    new Set(
      memberships.docs
        .map((docSnap) => docSnap.ref.parent.parent?.id)
        .filter((id): id is string => Boolean(id)),
    ),
  );
  if (groupIds.length === 0) {
    return 0;
  }
  await Promise.all(
    groupIds.map((groupId) =>
      setDoc(
        doc(db, 'groups', groupId, 'availability', uid),
        {
          uid,
          busyBlocks,
          rangeStart: start.toISOString(),
          rangeEnd: end.toISOString(),
          updatedAt: serverTimestamp(),
        },
        { merge: true },
      ),
    ),
  );
  return groupIds.length;
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
      const userRef = doc(db, 'users', auth.currentUser.uid);
      const userSnap = await getDoc(userRef);
      const lastSyncedAt = userSnap.exists()
        ? (userSnap.data()?.calendarSync?.updatedAt as Timestamp | undefined)
        : undefined;
      if (ENABLE_SYNC_COOLDOWN && lastSyncedAt) {
        const lastSyncMs = lastSyncedAt.toMillis();
        const cooldownMs = SYNC_COOLDOWN_MINUTES * 60 * 1000;
        if (Date.now() - lastSyncMs < cooldownMs) {
          const { start, end } = getRange(startDate, endDate);
          const bucketIds = getBucketIdsForRange(start, end);
          const bucketSnaps = await Promise.all(
            bucketIds.map((bucketId) =>
              getDoc(
                doc(
                  db,
                  'users',
                  auth.currentUser!.uid,
                  'eventBuckets',
                  bucketId,
                ),
              ),
            ),
          );
          const hasBuckets = bucketSnaps.some((snap) => snap.exists());
          if (hasBuckets) {
            return {
              data: {
                skipped: true,
                reason: 'cooldown',
                lastSyncedAt: lastSyncedAt.toDate(),
                nextSyncAt: new Date(lastSyncMs + cooldownMs),
              },
            };
          }
        }
      }
      const token = await authApi.getGoogleAccessToken();
      const { start, end } = getRange(startDate, endDate);
      const calendarList = await fetchGoogle<{
        items: GoogleCalendarListItem[];
      }>('/users/me/calendarList', token);
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

      batches.push(batch);
      await chunkedBatchCommit(batches);

      await writeEventBuckets(auth.currentUser.uid, events, start, end);

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

      let groupAvailabilityRefreshed = false;
      let groupAvailabilityRefreshError: string | undefined;
      try {
        const busyBlocks = buildBusyBlocksFromEvents(events, start, end);
        await refreshGroupAvailabilityCache(
          auth.currentUser.uid,
          start,
          end,
          busyBlocks,
        );
        groupAvailabilityRefreshed = true;
      } catch (error) {
        groupAvailabilityRefreshError =
          error instanceof Error
            ? error.message
            : '그룹 가용성 캐시 갱신 실패';
        console.warn('Group availability cache refresh failed:', error);
      }

      let shareLinksRefreshed = false;
      let shareLinksRefreshError: string | undefined;
      let meetingAvailabilityRefreshed = false;
      let meetingAvailabilityRefreshError: string | undefined;
      try {
        await sharingApi.refreshShareLinksForOwner();
        shareLinksRefreshed = true;
      } catch (error) {
        shareLinksRefreshError =
          error instanceof Error ? error.message : '공유 링크 갱신 실패';
        console.warn('Share link refresh failed:', error);
      }
      try {
        await meetingApi.refreshMyMeetingAvailabilityForRange(start, end);
        meetingAvailabilityRefreshed = true;
      } catch (error) {
        meetingAvailabilityRefreshError =
          error instanceof Error ? error.message : '미팅 가용성 갱신 실패';
        console.warn('Meeting availability refresh failed:', error);
      }

      return {
        data: {
          calendars,
          eventsCount: events.length,
          groupAvailabilityRefreshed,
          ...(groupAvailabilityRefreshError
            ? { groupAvailabilityRefreshError }
            : {}),
          shareLinksRefreshed,
          ...(shareLinksRefreshError
            ? { shareLinksRefreshError }
            : {}),
          meetingAvailabilityRefreshed,
          ...(meetingAvailabilityRefreshError
            ? { meetingAvailabilityRefreshError }
            : {}),
        },
      };
    } catch (error) {
      console.error('Calendar sync failed:', error);
      return {
        error: error instanceof Error ? error.message : '캘린더 동기화 실패',
      };
    }
  },

  createTimetableEvents: async (
    events: TimetableRecurringEvent[],
    options: { startDate: Date; endDate: Date },
  ) => {
    if (!auth.currentUser) {
      return { error: '로그인이 필요합니다.' };
    }
    if (options.endDate < options.startDate) {
      return { error: '종료일은 시작일 이후여야 합니다.' };
    }
    const token = await authApi.getGoogleAccessToken();
    const calendarId = await ensureManualCalendarId(
      auth.currentUser.uid,
      token,
    );
    const batchId = String(Date.now());
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const untilDate = new Date(options.endDate);
    untilDate.setHours(23, 59, 59, 999);
    const until = toRruleUntilUtc(untilDate);

    const requests = events
      .map((event) => {
        const byDay = isoWeekdayToRrule(event.weekday);
        const start = parseHourMinute(event.startTime);
        const end = parseHourMinute(event.endTime);
        if (!byDay || !start || !end) return null;

        const firstDate = getFirstOccurrenceDate(options.startDate, event.weekday);
        if (firstDate.getTime() > options.endDate.getTime()) {
          return null;
        }

        const startDateTime = new Date(firstDate);
        startDateTime.setHours(start.hour, start.minute, 0, 0);
        const endDateTime = new Date(firstDate);
        endDateTime.setHours(end.hour, end.minute, 0, 0);
        if (endDateTime <= startDateTime) {
          endDateTime.setDate(endDateTime.getDate() + 1);
        }

        return fetchGoogleRequest(
          `/calendars/${encodeDocId(calendarId)}/events`,
          token,
          {
            method: 'POST',
            body: JSON.stringify({
              summary: event.title,
              location: event.location,
              start: {
                dateTime: startDateTime.toISOString(),
                timeZone,
              },
              end: {
                dateTime: endDateTime.toISOString(),
                timeZone,
              },
              recurrence: [`RRULE:FREQ=WEEKLY;BYDAY=${byDay};UNTIL=${until}`],
              extendedProperties: {
                private: {
                  source: 'timetable-upload',
                  batchId,
                },
              },
            }),
          },
        );
      })
      .filter((request): request is Promise<unknown> => Boolean(request));

    if (requests.length === 0) {
      return { error: '유효한 반복 일정이 없습니다.' };
    }

    await Promise.all(requests);

    return { data: true };
  },

  deleteTimetableEvents: async (start: Date, end: Date) => {
    if (!auth.currentUser) {
      return { error: '로그인이 필요합니다.' };
    }
    const token = await authApi.getGoogleAccessToken();
    const calendarId = await ensureManualCalendarId(
      auth.currentUser.uid,
      token,
    );
    const items: Array<{
      id: string;
      extendedProperties?: { private?: Record<string, string> };
    }> = [];
    let pageToken: string | undefined;
    do {
      const data = await fetchGoogle<{
        items?: Array<{
          id: string;
          extendedProperties?: { private?: Record<string, string> };
        }>;
        nextPageToken?: string;
      }>(`/calendars/${encodeDocId(calendarId)}/events`, token, {
        timeMin: start.toISOString(),
        timeMax: end.toISOString(),
        singleEvents: 'false',
        maxResults: '2500',
        ...(pageToken ? { pageToken } : {}),
      });
      items.push(...(data.items ?? []));
      pageToken = data.nextPageToken;
    } while (pageToken);

    const deletions = items
      .filter(
        (event) =>
          event.extendedProperties?.private?.source === 'timetable-upload',
      )
      .map((event) =>
        fetchGoogleRequest(
          `/calendars/${encodeDocId(calendarId)}/events/${encodeDocId(event.id)}`,
          token,
          { method: 'DELETE' },
        ),
      );

    await Promise.all(deletions);
    return { data: true };
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
    const calendars = snapshot.docs.map(
      (docSnap) => docSnap.data() as StoredCalendar,
    );
    return { data: calendars };
  },

  getEvents: async (startDate: Date, endDate: Date) => {
    if (!auth.currentUser) {
      return { data: [] as StoredEvent[] };
    }
    const bucketEvents = await readBucketEvents(
      auth.currentUser.uid,
      startDate,
      endDate,
    );
    const events = bucketEvents
      .map((event) => ({
        ...event,
        startTime: event.startTime.toDate(),
        endTime: event.endTime.toDate(),
      }))
      .filter((event) => event.endTime > startDate) as StoredEvent[];
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
