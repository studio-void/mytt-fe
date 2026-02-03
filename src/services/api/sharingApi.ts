import { addMonths } from 'date-fns';
import {
  Timestamp,
  collection,
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

import { readBucketEvents } from '@/services/api/eventBuckets';
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

const SHARE_LINKS_COLLECTION = 'shareLinks';
const SHARE_EVENTS_SUBCOLLECTION = 'events';
const SHARE_RANGE_MONTHS = 2;
const MAX_BATCH_SIZE = 450;

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
      data.nickname ?? data.email ?? data.displayName ?? fallbackEmail ?? null;
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
      startTime: event.startTime.toDate().toISOString(),
      endTime: event.endTime.toDate().toISOString(),
      isBusy: true,
      calendarTitle: event.calendarTitle,
      calendarColor: event.calendarColor,
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
      calendarColor: event.calendarColor,
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

const replaceShareLinkEvents = async (
  linkDocId: string,
  ownerUid: string,
  privacyLevel: PrivacyLevel,
) => {
  const { start, end } = buildRange();
  const sourceEvents = await fetchOwnerEvents(ownerUid, start, end);
  const shareEventsRef = collection(
    db,
    SHARE_LINKS_COLLECTION,
    linkDocId,
    SHARE_EVENTS_SUBCOLLECTION,
  );
  const existingSnapshot = await getDocs(shareEventsRef);

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

  existingSnapshot.docs.forEach((docSnap) => {
    batch.delete(docSnap.ref);
    batchCount += 1;
    commitIfNeeded();
  });

  sourceEvents.forEach((event) => {
    const mapped = mapEventForPrivacy(event, privacyLevel);
    const eventRef = doc(
      db,
      SHARE_LINKS_COLLECTION,
      linkDocId,
      SHARE_EVENTS_SUBCOLLECTION,
      encodeKey(event.id),
    );
    batch.set(
      eventRef,
      stripUndefined({
        ...mapped,
        startTime: Timestamp.fromDate(new Date(mapped.startTime)),
        endTime: Timestamp.fromDate(new Date(mapped.endTime)),
        updatedAt: serverTimestamp(),
      }),
      { merge: true },
    );
    batchCount += 1;
    commitIfNeeded();
  });

  batches.push(batch);
  await Promise.all(batches.map((nextBatch) => nextBatch.commit()));

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

    await replaceShareLinkEvents(linkDocId, user.uid, data.privacyLevel);

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

    await replaceShareLinkEvents(linkDocId, user.uid, data.privacyLevel);

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
    const eventsRef = collection(
      db,
      SHARE_LINKS_COLLECTION,
      linkDocId,
      SHARE_EVENTS_SUBCOLLECTION,
    );
    const eventsSnap = await getDocs(eventsRef);
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

    eventsSnap.docs.forEach((docSnap) => {
      batch.delete(docSnap.ref);
      batchCount += 1;
      commitIfNeeded();
    });

    batch.delete(doc(db, SHARE_LINKS_COLLECTION, linkDocId));
    batches.push(batch);
    await Promise.all(batches.map((nextBatch) => nextBatch.commit()));

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
      await replaceShareLinkEvents(link.id, user.uid, link.privacyLevel);
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

    const eventsRef = collection(
      db,
      SHARE_LINKS_COLLECTION,
      linkDocId,
      SHARE_EVENTS_SUBCOLLECTION,
    );
    let eventsSnapshot;
    try {
      eventsSnapshot = await getDocs(
        query(
          eventsRef,
          where('startTime', '<=', Timestamp.fromDate(end)),
          orderBy('startTime'),
        ),
      );
    } catch (error) {
      if (isFirestorePermissionError(error)) {
        return { error: 'access_denied', data: null };
      }
      throw error;
    }

    const events = eventsSnapshot.docs
      .map((docSnap) => ({
        id: docSnap.id,
        ...(docSnap.data() as {
          title?: string;
          description?: string;
          location?: string;
          startTime: Timestamp;
          endTime: Timestamp;
          isBusy: boolean;
          calendarTitle?: string;
          calendarColor?: string;
        }),
      }))
      .filter((event) => event.endTime.toDate() >= start)
      .map((event) => mapEventForPrivacy(event, link.privacyLevel));

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
