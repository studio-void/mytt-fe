import { addMinutes } from 'date-fns';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  where,
} from 'firebase/firestore';

import { auth, db } from '@/services/firebase';

interface MeetingDoc {
  title: string;
  description?: string;
  startTime: Timestamp;
  endTime: Timestamp;
  timezone?: string;
  hostUid: string;
  inviteCode: string;
  createdAt?: Timestamp;
}

interface ParticipantDoc {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
  joinedAt?: Timestamp;
}

interface AvailabilityDoc {
  uid: string;
  busyBlocks: TimeBlock[];
  manualBlocks: TimeBlock[];
  updatedAt?: Timestamp;
}

interface TimeBlock {
  startTime: string;
  endTime: string;
}

interface AvailabilitySlot {
  startTime: string;
  endTime: string;
  availableCount: number;
  availability: number;
  isOptimal: boolean;
}

const SLOT_MINUTES = 30;

const ensureUser = () => {
  if (!auth.currentUser) {
    throw new Error('로그인이 필요합니다.');
  }
  return auth.currentUser;
};

const generateInviteCode = () => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i += 1) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
};

const generateUniqueInviteCode = async () => {
  let attempts = 0;
  while (attempts < 5) {
    const code = generateInviteCode();
    const existing = await fetchMeetingByInviteCode(code);
    if (!existing) {
      return code;
    }
    attempts += 1;
  }
  return generateInviteCode();
};

const normalizeBlock = (block: TimeBlock) => {
  const start = new Date(block.startTime);
  const end = new Date(block.endTime);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return null;
  }
  if (end <= start) return null;
  return { start, end };
};

const blocksOverlap = (start: Date, end: Date, block: TimeBlock) => {
  const normalized = normalizeBlock(block);
  if (!normalized) return false;
  return normalized.start < end && normalized.end > start;
};

const fetchMeetingByInviteCode = async (inviteCode: string) => {
  const meetingsRef = collection(db, 'meetings');
  const snapshot = await getDocs(
    query(meetingsRef, where('inviteCode', '==', inviteCode)),
  );
  const docSnap = snapshot.docs[0];
  if (!docSnap) {
    return null;
  }
  return { id: docSnap.id, ...(docSnap.data() as MeetingDoc) };
};

const meetingToClient = (meeting: { id: string } & MeetingDoc) => ({
  id: meeting.id,
  title: meeting.title,
  description: meeting.description,
  startTime: meeting.startTime.toDate().toISOString(),
  endTime: meeting.endTime.toDate().toISOString(),
  timezone: meeting.timezone,
  hostUid: meeting.hostUid,
  inviteCode: meeting.inviteCode,
});

const fetchUserEvents = async (uid: string, start: Date, end: Date) => {
  const eventsRef = collection(db, 'users', uid, 'events');
  const snapshot = await getDocs(
    query(
      eventsRef,
      where('startTime', '<=', Timestamp.fromDate(end)),
      orderBy('startTime'),
    ),
  );
  return snapshot.docs
    .map((docSnap) => docSnap.data() as {
    startTime: Timestamp;
    endTime: Timestamp;
    isBusy: boolean;
  })
    .filter((event) => event.endTime.toDate() >= start);
};

const buildBusyBlocks = (
  events: Array<{ startTime: Timestamp; endTime: Timestamp; isBusy: boolean }>,
  manualBlocks: TimeBlock[],
) => {
  const eventBlocks = events
    .filter((event) => event.isBusy)
    .map((event) => ({
      startTime: event.startTime.toDate().toISOString(),
      endTime: event.endTime.toDate().toISOString(),
    }));
  return [...eventBlocks, ...manualBlocks];
};

const upsertParticipant = async (meetingId: string, user: ParticipantDoc) => {
  const participantRef = doc(db, 'meetings', meetingId, 'participants', user.uid);
  await setDoc(
    participantRef,
    {
      ...user,
      joinedAt: serverTimestamp(),
    },
    { merge: true },
  );
};

const upsertAvailability = async (
  meetingId: string,
  userId: string,
  start: Date,
  end: Date,
  manualBlocks: TimeBlock[],
) => {
  const events = await fetchUserEvents(userId, start, end);
  const busyBlocks = buildBusyBlocks(events, manualBlocks);
  const availabilityRef = doc(db, 'meetings', meetingId, 'availability', userId);
  await setDoc(
    availabilityRef,
    {
      uid: userId,
      busyBlocks,
      manualBlocks,
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
};

const getExistingManualBlocks = async (meetingId: string, userId: string) => {
  const availabilityRef = doc(
    db,
    'meetings',
    meetingId,
    'availability',
    userId,
  );
  const snapshot = await getDoc(availabilityRef);
  if (!snapshot.exists()) {
    return [];
  }
  const data = snapshot.data() as AvailabilityDoc;
  return data.manualBlocks ?? [];
};

const buildAvailabilitySlots = (
  start: Date,
  end: Date,
  participants: ParticipantDoc[],
  availabilityDocs: AvailabilityDoc[],
) => {
  const availabilityMap = new Map<string, AvailabilityDoc>();
  availabilityDocs.forEach((doc) => availabilityMap.set(doc.uid, doc));
  const slots: AvailabilitySlot[] = [];

  for (
    let cursor = new Date(start);
    cursor < end;
    cursor = addMinutes(cursor, SLOT_MINUTES)
  ) {
    const slotStart = new Date(cursor);
    const slotEnd = addMinutes(slotStart, SLOT_MINUTES);
    if (slotEnd > end) break;

    let availableCount = 0;
    participants.forEach((participant) => {
      const availability = availabilityMap.get(participant.uid);
      if (!availability) {
        return;
      }
      const isBusy = availability.busyBlocks.some((block) =>
        blocksOverlap(slotStart, slotEnd, block),
      );
      if (!isBusy) {
        availableCount += 1;
      }
    });

    const availability = participants.length
      ? availableCount / participants.length
      : 0;

    slots.push({
      startTime: slotStart.toISOString(),
      endTime: slotEnd.toISOString(),
      availableCount,
      availability,
      isOptimal: participants.length > 0 && availableCount === participants.length,
    });
  }

  return slots;
};

export const meetingApi = {
  createMeeting: async (data: {
    title: string;
    description?: string;
    startTime: string;
    endTime: string;
    timezone?: string;
  }) => {
    const user = ensureUser();
    const inviteCode = await generateUniqueInviteCode();
    const meetingRef = doc(collection(db, 'meetings'));
    const meetingData: MeetingDoc = {
      title: data.title,
      description: data.description,
      startTime: Timestamp.fromDate(new Date(data.startTime)),
      endTime: Timestamp.fromDate(new Date(data.endTime)),
      timezone: data.timezone,
      hostUid: user.uid,
      inviteCode,
      createdAt: Timestamp.fromDate(new Date()),
    };
    await setDoc(meetingRef, {
      ...meetingData,
      createdAt: serverTimestamp(),
    });

    await upsertParticipant(meetingRef.id, {
      uid: user.uid,
      email: user.email,
      displayName: user.displayName,
      photoURL: user.photoURL,
    });
    await upsertAvailability(
      meetingRef.id,
      user.uid,
      new Date(data.startTime),
      new Date(data.endTime),
      [],
    );

    return {
      data: {
        id: meetingRef.id,
        inviteCode,
      },
    };
  },

  joinMeeting: async (inviteCode: string) => {
    const meeting = await fetchMeetingByInviteCode(inviteCode);
    if (!meeting) {
      throw new Error('약속을 찾을 수 없습니다.');
    }
    await meetingApi.joinMeetingByCode(inviteCode);
    return { data: { id: meeting.id } };
  },

  getMeetingDetail: async (meetingId: string) => {
    const meetingRef = doc(db, 'meetings', meetingId);
    const snapshot = await getDoc(meetingRef);
    if (!snapshot.exists()) {
      throw new Error('약속을 찾을 수 없습니다.');
    }
    return { data: meetingToClient({ id: snapshot.id, ...(snapshot.data() as MeetingDoc) }) };
  },

  getMeetingByCode: async (inviteCode: string) => {
    const meeting = await fetchMeetingByInviteCode(inviteCode);
    if (!meeting) {
      throw new Error('약속을 찾을 수 없습니다.');
    }
    return { data: meetingToClient(meeting) };
  },

  updateStatus: async () => {
    return { data: true };
  },

  joinMeetingByCode: async (inviteCode: string) => {
    const user = ensureUser();
    const meeting = await fetchMeetingByInviteCode(inviteCode);
    if (!meeting) {
      throw new Error('약속을 찾을 수 없습니다.');
    }

    await upsertParticipant(meeting.id, {
      uid: user.uid,
      email: user.email,
      displayName: user.displayName,
      photoURL: user.photoURL,
    });
    const existingBlocks = await getExistingManualBlocks(meeting.id, user.uid);
    await upsertAvailability(
      meeting.id,
      user.uid,
      meeting.startTime.toDate(),
      meeting.endTime.toDate(),
      existingBlocks,
    );

    return { data: true };
  },

  updateManualBlocks: async (
    meetingId: string,
    blocks: TimeBlock[],
  ) => {
    const user = ensureUser();
    const meetingRef = doc(db, 'meetings', meetingId);
    const meetingSnap = await getDoc(meetingRef);
    if (!meetingSnap.exists()) {
      throw new Error('약속을 찾을 수 없습니다.');
    }
    const meeting = meetingSnap.data() as MeetingDoc;
    await upsertAvailability(
      meetingId,
      user.uid,
      meeting.startTime.toDate(),
      meeting.endTime.toDate(),
      blocks,
    );
    return { data: true };
  },

  getMeetingParticipants: async (inviteCode: string) => {
    const meeting = await fetchMeetingByInviteCode(inviteCode);
    if (!meeting) {
      throw new Error('약속을 찾을 수 없습니다.');
    }
    const participantsRef = collection(
      db,
      'meetings',
      meeting.id,
      'participants',
    );
    const snapshot = await getDocs(query(participantsRef, orderBy('joinedAt')));
    const participants = snapshot.docs.map(
      (docSnap) => docSnap.data() as ParticipantDoc,
    );
    return { data: participants };
  },

  getMeetingAvailability: async (inviteCode: string) => {
    const meeting = await fetchMeetingByInviteCode(inviteCode);
    if (!meeting) {
      throw new Error('약속을 찾을 수 없습니다.');
    }
    const participantsRef = collection(
      db,
      'meetings',
      meeting.id,
      'participants',
    );
    const availabilityRef = collection(
      db,
      'meetings',
      meeting.id,
      'availability',
    );
    const [participantsSnap, availabilitySnap] = await Promise.all([
      getDocs(query(participantsRef, orderBy('joinedAt'))),
      getDocs(availabilityRef),
    ]);
    const participants = participantsSnap.docs.map(
      (docSnap) => docSnap.data() as ParticipantDoc,
    );
    const availabilityDocs = availabilitySnap.docs.map(
      (docSnap) => docSnap.data() as AvailabilityDoc,
    );
    const availabilitySlots = buildAvailabilitySlots(
      meeting.startTime.toDate(),
      meeting.endTime.toDate(),
      participants,
      availabilityDocs,
    );
    return { data: { availabilitySlots } };
  },

  getMyAvailability: async (meetingId: string) => {
    const user = ensureUser();
    const availabilityRef = doc(
      db,
      'meetings',
      meetingId,
      'availability',
      user.uid,
    );
    const snapshot = await getDoc(availabilityRef);
    if (!snapshot.exists()) {
      return { data: null };
    }
    return { data: snapshot.data() as AvailabilityDoc };
  },
};
