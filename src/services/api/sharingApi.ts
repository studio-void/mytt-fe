import { addMonths } from 'date-fns';
import {
  Timestamp,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  where,
} from 'firebase/firestore';

import {
  getBucketIdsForRange,
  readBucketEvents,
} from '@/services/api/eventBuckets';
import {
  auth,
  db,
  isFirestoreOfflineError,
  isFirestorePermissionError,
} from '@/services/firebase';

export type PrivacyLevel = 'busy_only' | 'basic_info' | 'full_details';
export type SharingAudience = 'public' | 'restricted';

export interface ShareLink {
  id: string;
  ownerUid: string;
  ownerEmail: string;
  ownerNickname?: string | null;
  ownerPhotoURL?: string | null;
  linkId: string;
  privacyLevel: PrivacyLevel;
  audience: SharingAudience;
  allowedEmails: string[];
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

interface SharedEvent {
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

interface SharedStoredEvent {
  id: string;
  title?: string;
  startTime: Timestamp;
  endTime: Timestamp;
  description?: string;
  location?: string;
  isBusy: boolean;
  calendarTitle?: string;
  calendarColor?: string;
}

const SHARE_LINKS_COLLECTION = 'shareLinks';
const SHARE_EVENTS_BUCKETS_SUBCOLLECTION = 'eventBuckets';
const LEGACY_SHARE_EVENTS_SUBCOLLECTION = 'events';
const SHARE_RANGE_MONTHS = 2;

const defaultSettings = {
  privacyLevel: 'busy_only' as PrivacyLevel,
  audience: 'public' as SharingAudience,
  allowedEmails: [] as string[],
};

const normalizeEmail = (email: string) => email.trim().toLowerCase();

const normalizeLinkId = (linkId: string) =>
  linkId
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-_]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[-_]+|[-_]+$/g, '');

const isValidLinkId = (linkId: string) =>
  linkId.length >= 3 && linkId.length <= 32;

const encodeKey = (value: string) =>
  encodeURIComponent(value).replace(/\./g, '%2E');

const buildShareLinkDocId = (uid: string, linkId: string) =>
  `${encodeKey(uid)}__${encodeKey(linkId)}`;

const generateLinkId = () => {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < 6; i += 1) {
    result += chars[Math.floor(Math.random() * chars.length)];
  }
  return result;
};

const getOwnerProfile = async (
  ownerUid: string,
  fallbackEmail?: string | null,
) => {
  try {
    const snapshot = await getDoc(doc(db, 'users', ownerUid));
    if (!snapshot.exists()) {
      return {
        ownerNickname: fallbackEmail ?? null,
        ownerPhotoURL: null,
      };
    }
    const data = snapshot.data() as {
      nickname?: string | null;
      photoURL?: string | null;
      email?: string | null;
      displayName?: string | null;
    };
    const ownerNickname =
      data.nickname ?? data.displayName ?? data.email ?? fallbackEmail ?? null;
    return {
      ownerNickname,
      ownerPhotoURL: data.photoURL ?? null,
    };
  } catch (error) {
    if (isFirestorePermissionError(error)) {
      return {
        ownerNickname: fallbackEmail ?? null,
        ownerPhotoURL: null,
      };
    }
    throw error;
  }
};

const mapEventForPrivacy = (
  event: {
    id: string;
    title?: string;
    description?: string;
    location?: string;
    startTime: Timestamp;
    endTime: Timestamp;
    isBusy: boolean;
    calendarTitle?: string;
    calendarColor?: string;
  },
  privacyLevel: PrivacyLevel,
): SharedEvent => {
  if (privacyLevel === 'busy_only') {
    return {
      id: event.id,
      title: '바쁜 시간',
      startTime: event.startTime.toDate().toISOString(),
      endTime: event.endTime.toDate().toISOString(),
      isBusy: true,
    };
  }

  if (privacyLevel === 'basic_info') {
    return {
      id: event.id,
      title: event.title,
      startTime: event.startTime.toDate().toISOString(),
      endTime: event.endTime.toDate().toISOString(),
      isBusy: event.isBusy,
      calendarTitle: event.calendarTitle,
    };
  }

  return {
    id: event.id,
    title: event.title,
    description: event.description,
    location: event.location,
    startTime: event.startTime.toDate().toISOString(),
    endTime: event.endTime.toDate().toISOString(),
    isBusy: event.isBusy,
    calendarTitle: event.calendarTitle,
    calendarColor: event.calendarColor,
  };
};

const stripUndefined = <T extends Record<string, unknown>>(value: T) =>
  Object.fromEntries(
    Object.entries(value).filter(([, entry]) => entry !== undefined),
  ) as T;

const ensureUser = () => {
  if (!auth.currentUser) {
    throw new Error('로그인이 필요합니다.');
  }
  return auth.currentUser;
};

const buildRange = () => {
  const start = addMonths(new Date(), -SHARE_RANGE_MONTHS);
  const end = addMonths(new Date(), SHARE_RANGE_MONTHS);
  return { start, end };
};

const fetchOwnerEvents = async (ownerUid: string, start: Date, end: Date) =>
  readBucketEvents(ownerUid, start, end);

const sortEvents = (events: SharedStoredEvent[]) =>
  [...events].sort((left, right) => {
    const timeDiff = left.startTime.toMillis() - right.startTime.toMillis();
    if (timeDiff !== 0) return timeDiff;
    return left.id.localeCompare(right.id);
  });

const serializeEvents = (events: SharedStoredEvent[]) =>
  sortEvents(events).map((event) =>
    JSON.stringify({
      ...event,
      startTime: event.startTime.toMillis(),
      endTime: event.endTime.toMillis(),
    }),
  );

const areSameEvents = (left: SharedStoredEvent[], right: SharedStoredEvent[]) => {
  const normalizedLeft = serializeEvents(left);
  const normalizedRight = serializeEvents(right);
  if (normalizedLeft.length !== normalizedRight.length) return false;
  return normalizedLeft.every((value, index) => value === normalizedRight[index]);
};

const toStoredShareEvent = (
  event: {
    id: string;
    title?: string;
    description?: string;
    location?: string;
    startTime: Timestamp;
    endTime: Timestamp;
    isBusy: boolean;
    calendarTitle?: string;
    calendarColor?: string;
  },
  privacyLevel: PrivacyLevel,
) => {
  const mapped = mapEventForPrivacy(event, privacyLevel);
  return stripUndefined({
    ...mapped,
    startTime: Timestamp.fromDate(new Date(mapped.startTime)),
    endTime: Timestamp.fromDate(new Date(mapped.endTime)),
  }) as SharedStoredEvent;
};

const mapStoredEventToClient = (event: SharedStoredEvent): SharedEvent => ({
  id: event.id,
  title: event.title,
  description: event.description,
  location: event.location,
  startTime: event.startTime.toDate().toISOString(),
  endTime: event.endTime.toDate().toISOString(),
  isBusy: event.isBusy,
  calendarTitle: event.calendarTitle,
  calendarColor: event.calendarColor,
});

const syncShareLinkEventBuckets = async (
  linkDocId: string,
  ownerUid: string,
  privacyLevel: PrivacyLevel,
) => {
  const { start, end } = buildRange();
  const sourceEvents = await fetchOwnerEvents(ownerUid, start, end);
  const bucketIds = getBucketIdsForRange(start, end);
  const nextByBucket = new Map<string, SharedStoredEvent[]>();
  bucketIds.forEach((bucketId) => nextByBucket.set(bucketId, []));

  sourceEvents.forEach((event) => {
    const nextEvent = toStoredShareEvent(event, privacyLevel);
    const targetBuckets = getBucketIdsForRange(
      nextEvent.startTime.toDate(),
      nextEvent.endTime.toDate(),
    );
    targetBuckets.forEach((bucketId) => {
      const events = nextByBucket.get(bucketId);
      if (!events) return;
      events.push(nextEvent);
    });
  });

  const existingSnaps = await Promise.all(
    bucketIds.map((bucketId) =>
      getDoc(
        doc(
          db,
          SHARE_LINKS_COLLECTION,
          linkDocId,
          SHARE_EVENTS_BUCKETS_SUBCOLLECTION,
          bucketId,
        ),
      ),
    ),
  );

  const writeOps: Array<Promise<void>> = [];
  bucketIds.forEach((bucketId, index) => {
    const bucketRef = doc(
      db,
      SHARE_LINKS_COLLECTION,
      linkDocId,
      SHARE_EVENTS_BUCKETS_SUBCOLLECTION,
      bucketId,
    );
    const nextEvents = sortEvents(nextByBucket.get(bucketId) ?? []);
    const existingEvents = existingSnaps[index].exists()
      ? ((existingSnaps[index].data() as { events?: SharedStoredEvent[] })
          .events ?? [])
      : [];
    if (areSameEvents(existingEvents, nextEvents)) {
      return;
    }
    if (nextEvents.length === 0) {
      writeOps.push(deleteDoc(bucketRef));
      return;
    }
    writeOps.push(
      setDoc(
        bucketRef,
        {
          events: nextEvents,
          updatedAt: serverTimestamp(),
        },
        { merge: true },
      ),
    );
  });
  await Promise.all(writeOps);

  await setDoc(
    doc(db, SHARE_LINKS_COLLECTION, linkDocId),
    { lastSyncedAt: serverTimestamp() },
    { merge: true },
  );
};

const getShareLinkDoc = async (linkDocId: string) => {
  const linkSnap = await getDoc(doc(db, SHARE_LINKS_COLLECTION, linkDocId));
  if (!linkSnap.exists()) return null;
  return { ...(linkSnap.data() as ShareLink), id: linkSnap.id };
};

export const sharingApi = {
  getShareLinks: async () => {
    const user = ensureUser();
    const snapshot = await getDocs(
      query(
        collection(db, SHARE_LINKS_COLLECTION),
        where('ownerUid', '==', user.uid),
        orderBy('createdAt', 'desc'),
      ),
    );
    return {
      data: snapshot.docs.map((docSnap) => ({
        ...(docSnap.data() as ShareLink),
        id: docSnap.id,
      })),
    };
  },

  createShareLink: async (data: {
    linkId?: string;
    privacyLevel: PrivacyLevel;
    audience: SharingAudience;
    allowedEmails: string[];
  }) => {
    const user = ensureUser();
    if (!user.email) {
      throw new Error('이메일 정보가 필요합니다.');
    }
    const rawLinkId = data.linkId?.trim() || generateLinkId();
    const normalizedLinkId = normalizeLinkId(rawLinkId);
    if (!normalizedLinkId || !isValidLinkId(normalizedLinkId)) {
      throw new Error(
        '링크 ID는 3~32자의 영문/숫자/-/_ 만 사용할 수 있습니다.',
      );
    }
    const linkDocId = buildShareLinkDocId(user.uid, normalizedLinkId);
    const linkRef = doc(db, SHARE_LINKS_COLLECTION, linkDocId);
    const existing = await getDoc(linkRef);
    if (existing.exists()) {
      throw new Error('이미 사용 중인 링크 ID입니다.');
    }

    const normalizedEmails = data.allowedEmails
      .map((email) => normalizeEmail(email))
      .filter(Boolean);

    const ownerProfile = await getOwnerProfile(user.uid, user.email);
    const payload: ShareLink = {
      id: linkDocId,
      ownerUid: user.uid,
      ownerEmail: normalizeEmail(user.email),
      ownerNickname: ownerProfile.ownerNickname,
      ownerPhotoURL: ownerProfile.ownerPhotoURL,
      linkId: normalizedLinkId,
      privacyLevel: data.privacyLevel,
      audience: data.audience,
      allowedEmails: normalizedEmails,
    };

    await setDoc(
      linkRef,
      {
        ...payload,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    );

    await syncShareLinkEventBuckets(linkDocId, user.uid, data.privacyLevel);

    return { data: payload };
  },

  updateShareLink: async (
    linkDocId: string,
    data: {
      privacyLevel: PrivacyLevel;
      audience: SharingAudience;
      allowedEmails: string[];
    },
  ) => {
    const user = ensureUser();
    const existing = await getShareLinkDoc(linkDocId);
    if (!existing) {
      throw new Error('공유 링크를 찾을 수 없습니다.');
    }
    if (existing.ownerUid !== user.uid) {
      throw new Error('수정 권한이 없습니다.');
    }

    const normalizedEmails = data.allowedEmails
      .map((email) => normalizeEmail(email))
      .filter(Boolean);

    const ownerProfile = await getOwnerProfile(user.uid, user.email);
    await setDoc(
      doc(db, SHARE_LINKS_COLLECTION, linkDocId),
      {
        privacyLevel: data.privacyLevel,
        audience: data.audience,
        allowedEmails: normalizedEmails,
        ownerNickname: ownerProfile.ownerNickname,
        ownerPhotoURL: ownerProfile.ownerPhotoURL,
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    );

    if (existing.privacyLevel !== data.privacyLevel) {
      await syncShareLinkEventBuckets(linkDocId, user.uid, data.privacyLevel);
    }

    return {
      data: {
        ...existing,
        privacyLevel: data.privacyLevel,
        audience: data.audience,
        allowedEmails: normalizedEmails,
        ownerNickname: ownerProfile.ownerNickname,
        ownerPhotoURL: ownerProfile.ownerPhotoURL,
      },
    };
  },

  deleteShareLink: async (linkDocId: string) => {
    const user = ensureUser();
    const existing = await getShareLinkDoc(linkDocId);
    if (!existing) return { data: true };
    if (existing.ownerUid !== user.uid) {
      throw new Error('삭제 권한이 없습니다.');
    }
    const bucketDocs = await getDocs(
      collection(
        db,
        SHARE_LINKS_COLLECTION,
        linkDocId,
        SHARE_EVENTS_BUCKETS_SUBCOLLECTION,
      ),
    );
    const legacyEventsRef = collection(
      db,
      SHARE_LINKS_COLLECTION,
      linkDocId,
      LEGACY_SHARE_EVENTS_SUBCOLLECTION,
    );
    const legacyEventsSnap = await getDocs(legacyEventsRef);

    await Promise.all([
      ...bucketDocs.docs.map((docSnap) => deleteDoc(docSnap.ref)),
      ...legacyEventsSnap.docs.map((docSnap) => deleteDoc(docSnap.ref)),
      deleteDoc(doc(db, SHARE_LINKS_COLLECTION, linkDocId)),
    ]);

    return { data: true };
  },

  refreshShareLinksForOwner: async () => {
    const user = ensureUser();
    const snapshot = await getDocs(
      query(
        collection(db, SHARE_LINKS_COLLECTION),
        where('ownerUid', '==', user.uid),
      ),
    );

    const links = snapshot.docs.map((docSnap) => ({
      ...(docSnap.data() as ShareLink),
      id: docSnap.id,
    }));

    for (const link of links) {
      await syncShareLinkEventBuckets(link.id, user.uid, link.privacyLevel);
    }

    return { data: true };
  },

  getSharedSchedule: async (
    uid: string,
    linkId: string,
    viewerEmail?: string | null,
  ) => {
    const normalizedLinkId = normalizeLinkId(linkId);
    if (!uid || !normalizedLinkId) {
      return { data: null };
    }
    const linkDocId = buildShareLinkDocId(uid, normalizedLinkId);

    const normalizedViewerEmail = viewerEmail
      ? normalizeEmail(viewerEmail)
      : null;

    let link: ShareLink | null = null;
    try {
      const linkSnap = await getDoc(doc(db, SHARE_LINKS_COLLECTION, linkDocId));
      link = linkSnap.exists()
        ? ({ ...(linkSnap.data() as ShareLink), id: linkSnap.id } as ShareLink)
        : null;
    } catch (error) {
      if (!isFirestorePermissionError(error)) {
        throw error;
      }
    }

    if (!link) {
      return { data: null };
    }

    if (link.ownerUid !== uid) {
      return { data: null };
    }

    if (link.audience === 'restricted') {
      const allowedEmails = (link.allowedEmails ?? []).map(normalizeEmail);
      if (
        !normalizedViewerEmail ||
        !allowedEmails.includes(normalizedViewerEmail)
      ) {
        return { error: 'access_denied', data: null };
      }
    }

    const { start, end } = buildRange();

    const bucketIds = getBucketIdsForRange(start, end);
    let bucketEvents: SharedStoredEvent[] = [];
    try {
      const bucketSnaps = await Promise.all(
        bucketIds.map((bucketId) =>
          getDoc(
            doc(
              db,
              SHARE_LINKS_COLLECTION,
              linkDocId,
              SHARE_EVENTS_BUCKETS_SUBCOLLECTION,
              bucketId,
            ),
          ),
        ),
      );
      bucketEvents = bucketSnaps.flatMap((bucketSnap) => {
        if (!bucketSnap.exists()) return [];
        const data = bucketSnap.data() as { events?: SharedStoredEvent[] };
        return data.events ?? [];
      });
    } catch (error) {
      if (isFirestorePermissionError(error)) {
        return { error: 'access_denied', data: null };
      }
      throw error;
    }

    if (bucketEvents.length === 0) {
      const legacyEventsRef = collection(
        db,
        SHARE_LINKS_COLLECTION,
        linkDocId,
        LEGACY_SHARE_EVENTS_SUBCOLLECTION,
      );
      try {
        const legacySnapshot = await getDocs(
          query(
            legacyEventsRef,
            where('startTime', '<=', Timestamp.fromDate(end)),
            orderBy('startTime'),
          ),
        );
        bucketEvents = legacySnapshot.docs.map((docSnap) => ({
          ...(docSnap.data() as SharedStoredEvent),
          id: docSnap.id,
        }));
      } catch (error) {
        if (isFirestorePermissionError(error)) {
          return { error: 'access_denied', data: null };
        }
        throw error;
      }
    }

    const deduped = new Map<string, SharedStoredEvent>();
    bucketEvents.forEach((event) => {
      const key = `${event.id}__${event.startTime.toMillis()}__${event.endTime.toMillis()}`;
      deduped.set(key, event);
    });

    const events = Array.from(deduped.values())
      .filter(
        (event) =>
          event.startTime.toDate() <= end && event.endTime.toDate() >= start,
      )
      .sort((left, right) => left.startTime.toMillis() - right.startTime.toMillis())
      .map((event) => mapStoredEventToClient(event));

    let ownerNickname = link.ownerNickname ?? null;
    let ownerPhotoURL = link.ownerPhotoURL ?? null;
    if (!ownerNickname || !ownerPhotoURL) {
      const ownerProfile = await getOwnerProfile(
        link.ownerUid,
        link.ownerEmail,
      );
      ownerNickname = ownerNickname ?? ownerProfile.ownerNickname;
      ownerPhotoURL = ownerPhotoURL ?? ownerProfile.ownerPhotoURL;
    }

    return {
      data: {
        userEmail: link.ownerEmail,
        userNickname: ownerNickname ?? link.ownerEmail,
        userPhotoURL: ownerPhotoURL ?? null,
        privacyLevel: link.privacyLevel,
        audience: link.audience,
        linkId: link.linkId,
        events,
      },
    };
  },

  getSettings: async () => {
    if (!auth.currentUser) {
      return { data: defaultSettings };
    }
    const settingsRef = doc(
      db,
      'users',
      auth.currentUser.uid,
      'sharing',
      'settings',
    );
    try {
      const snapshot = await getDoc(settingsRef);
      if (!snapshot.exists()) {
        await setDoc(settingsRef, {
          ...defaultSettings,
          updatedAt: serverTimestamp(),
        });
        return { data: defaultSettings };
      }
      return { data: snapshot.data() as typeof defaultSettings };
    } catch (error) {
      if (isFirestoreOfflineError(error)) {
        return { data: defaultSettings };
      }
      throw error;
    }
  },
};
