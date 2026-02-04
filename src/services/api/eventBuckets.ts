import {
  Timestamp,
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
} from 'firebase/firestore';

import { db } from '@/services/firebase';

export interface BucketEvent {
  id: string;
  calendarId: string;
  title: string;
  description?: string;
  location?: string;
  startTime: Timestamp;
  endTime: Timestamp;
  isAllDay: boolean;
  isBusy: boolean;
  calendarTitle?: string;
  calendarColor?: string;
}

interface WritableEvent {
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

const stripUndefined = <T extends Record<string, unknown>>(value: T) =>
  Object.fromEntries(
    Object.entries(value).filter(([, entry]) => entry !== undefined),
  ) as T;

const bucketIdForDate = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;

export const getBucketIdsForRange = (start: Date, end: Date) => {
  const cursor = new Date(start.getFullYear(), start.getMonth(), 1);
  const last = new Date(end.getFullYear(), end.getMonth(), 1);
  const ids: string[] = [];
  while (cursor <= last) {
    ids.push(bucketIdForDate(cursor));
    cursor.setMonth(cursor.getMonth() + 1);
  }
  return ids;
};

export const getBucketIdForMonth = (date: Date) => bucketIdForDate(date);

const bucketIdsForEvent = (event: WritableEvent) =>
  getBucketIdsForRange(event.startTime, event.endTime);

const bucketCache = new Map<string, BucketEvent[]>();

const getBucketCacheKey = (uid: string, bucketId: string) =>
  `${uid}::${bucketId}`;

export const writeEventBuckets = async (
  uid: string,
  events: WritableEvent[],
  start: Date,
  end: Date,
) => {
  const grouped = new Map<string, WritableEvent[]>();
  getBucketIdsForRange(start, end).forEach((bucketId) => {
    grouped.set(bucketId, []);
  });

  events.forEach((event) => {
    const bucketIds = bucketIdsForEvent(event);
    bucketIds.forEach((bucketId) => {
      const list = grouped.get(bucketId) ?? [];
      list.push(event);
      grouped.set(bucketId, list);
    });
  });

  const writes = Array.from(grouped.entries()).map(
    ([bucketId, bucketEvents]) => {
      const payload = bucketEvents.map((event) =>
        stripUndefined({
          ...event,
          startTime: Timestamp.fromDate(event.startTime),
          endTime: Timestamp.fromDate(event.endTime),
        }),
      );
      bucketCache.set(getBucketCacheKey(uid, bucketId), payload as BucketEvent[]);

      return setDoc(
        doc(db, 'users', uid, 'eventBuckets', bucketId),
        {
          events: payload,
          updatedAt: serverTimestamp(),
        },
        { merge: false },
      );
    },
  );

  await Promise.all(writes);
};

const readMonthBucketEventsCached = async (uid: string, bucketId: string) => {
  const cacheKey = getBucketCacheKey(uid, bucketId);
  const cached = bucketCache.get(cacheKey);
  if (cached) {
    return cached;
  }
  const snap = await getDoc(doc(db, 'users', uid, 'eventBuckets', bucketId));
  if (!snap.exists()) {
    bucketCache.set(cacheKey, []);
    return [];
  }
  const data = snap.data() as { events?: BucketEvent[] };
  const events = data.events ?? [];
  bucketCache.set(cacheKey, events);
  return events;
};

export const readBucketEvents = async (uid: string, start: Date, end: Date) => {
  const bucketIds = getBucketIdsForRange(start, end);
  const events: BucketEvent[] = [];
  const seen = new Set<string>();
  const buckets = await Promise.all(
    bucketIds.map((bucketId) => readMonthBucketEventsCached(uid, bucketId)),
  );
  buckets.forEach((bucketEvents) => {
    bucketEvents.forEach((event) => {
      const key = `${event.calendarId}__${event.id}`;
      if (seen.has(key)) return;
      seen.add(key);
      events.push(event);
    });
  });

  return events.filter(
    (event) =>
      event.endTime.toDate() >= start && event.startTime.toDate() <= end,
  );
};

export const readMonthBucketEvents = async (uid: string, date: Date) => {
  const bucketId = getBucketIdForMonth(date);
  return readMonthBucketEventsCached(uid, bucketId);
};
