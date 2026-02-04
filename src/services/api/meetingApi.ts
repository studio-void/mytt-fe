import { addMinutes } from 'date-fns';
import type { User } from 'firebase/auth';
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

import {
  readBucketEvents,
  readMonthBucketEvents,
} from '@/services/api/eventBuckets';
import { auth, db } from '@/services/firebase';

interface MeetingDoc {
  title: string;
  description?: string;
  startTime: Timestamp;
  endTime: Timestamp;
  timezone?: string;
  hostUid: string;
  inviteCode: string;
  groupId?: string | null;
  groupTitle?: string | null;
  createdAt?: Timestamp;
}

interface ParticipantDoc {
  uid: string;
  email: string | null;
  displayName: string | null;
  nickname: string | null;
  photoURL: string | null;
  joinedAt?: Timestamp;
}

interface GroupMemberDoc {
  uid: string;
  role: 'master' | 'manager' | 'member';
  email: string | null;
  displayName: string | null;
  nickname: string | null;
  photoURL: string | null;
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

const buildFallbackNickname = (user: User) =>
  user.displayName ?? user.email ?? null;

const resolveParticipantProfile = async (
  user: User,
): Promise<ParticipantDoc> => {
  const userRef = doc(db, 'users', user.uid);
  const snapshot = await getDoc(userRef);
  const data = snapshot.exists()
    ? (snapshot.data() as {
        nickname?: string | null;
        photoURL?: string | null;
      })
    : null;
  const nickname = data?.nickname ?? buildFallbackNickname(user);
  const photoURL = data?.photoURL ?? user.photoURL ?? null;

  const needsNickname = !data?.nickname && nickname;
  const needsPhotoURL = !data?.photoURL && photoURL;
  if (!snapshot.exists() || needsNickname || needsPhotoURL) {
    await setDoc(
      userRef,
      {
        ...(snapshot.exists()
          ? {}
          : {
              uid: user.uid,
              email: user.email,
              displayName: user.displayName,
            }),
        ...(needsNickname ? { nickname } : {}),
        ...(needsPhotoURL ? { photoURL } : {}),
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    );
  }

  return {
    uid: user.uid,
    email: user.email,
    displayName: user.displayName,
    nickname,
    photoURL,
  };
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

const deleteSubcollection = async (
  path: [string, ...string[]],
  chunkSize = 450,
) => {
  const ref = collection(db, ...path);
  const snapshot = await getDocs(ref);
  let batch = writeBatch(db);
  let batchCount = 0;
  const commits: Array<ReturnType<typeof batch.commit>> = [];

  snapshot.docs.forEach((docSnap) => {
    batch.delete(docSnap.ref);
    batchCount += 1;
    if (batchCount >= chunkSize) {
      commits.push(batch.commit());
      batch = writeBatch(db);
      batchCount = 0;
    }
  });

  commits.push(batch.commit());
  await Promise.all(commits);
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

const joinMeetingWithMeeting = async (
  meeting: { id: string } & MeetingDoc,
  user: User,
) => {
  const participantProfile = await resolveParticipantProfile(user);
  await upsertParticipant(meeting.id, participantProfile);
  const existingBlocks = await getExistingManualBlocks(meeting.id, user.uid);
  await upsertAvailability(
    meeting.id,
    user.uid,
    meeting.startTime.toDate(),
    meeting.endTime.toDate(),
    existingBlocks,
  );
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
  groupId: meeting.groupId ?? null,
  groupTitle: meeting.groupTitle ?? null,
  createdAt: meeting.createdAt?.toDate().toISOString() ?? null,
});

const fetchUserEvents = async (uid: string, start: Date, end: Date) =>
  readBucketEvents(uid, start, end);

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
  const participantRef = doc(
    db,
    'meetings',
    meetingId,
    'participants',
    user.uid,
  );
  await setDoc(
    participantRef,
    {
      ...user,
      joinedAt: serverTimestamp(),
    },
    { merge: true },
  );
};

const seedAvailability = async (meetingId: string, userId: string) => {
  const availabilityRef = doc(
    db,
    'meetings',
    meetingId,
    'availability',
    userId,
  );
  await setDoc(
    availabilityRef,
    {
      uid: userId,
      busyBlocks: [],
      manualBlocks: [],
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
};

const getGroupMeta = async (groupId: string) => {
  const groupSnap = await getDoc(doc(db, 'groups', groupId));
  if (!groupSnap.exists()) {
    throw new Error('그룹을 찾을 수 없습니다.');
  }
  const data = groupSnap.data() as { title?: string | null };
  return { groupTitle: data.title ?? null };
};

const getGroupMembers = async (groupId: string) => {
  const membersRef = collection(db, 'groups', groupId, 'members');
  const snapshot = await getDocs(membersRef);
  return snapshot.docs.map((docSnap) => docSnap.data() as GroupMemberDoc);
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
  const availabilityRef = doc(
    db,
    'meetings',
    meetingId,
    'availability',
    userId,
  );
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
  return {
    uid: userId,
    busyBlocks,
    manualBlocks,
  } as AvailabilityDoc;
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

  const rangeStart = new Date(start);
  const rangeEnd = new Date(end);
  const cursor = new Date(start);
  cursor.setHours(0, 0, 0, 0);
  const endCursor = new Date(end);
  endCursor.setHours(23, 59, 59, 999);

  for (let slotCursor = new Date(cursor); slotCursor < endCursor; ) {
    const slotStart = new Date(slotCursor);
    const slotEnd = addMinutes(slotStart, SLOT_MINUTES);
    slotCursor = slotEnd;

    if (slotStart < rangeStart || slotEnd > rangeEnd) {
      continue;
    }

    let availableCount = 0;
    participants.forEach((participant) => {
      const availability = availabilityMap.get(participant.uid);
      if (!availability) {
        availableCount += 1;
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
      isOptimal:
        participants.length > 0 && availableCount === participants.length,
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
    groupId?: string | null;
  }) => {
    const user = ensureUser();
    const inviteCode = await generateUniqueInviteCode();
    const meetingRef = doc(collection(db, 'meetings'));
    const startDate = new Date(data.startTime);
    const endDate = new Date(data.endTime);
    const groupMeta = data.groupId ? await getGroupMeta(data.groupId) : null;
    const meetingData: MeetingDoc = {
      title: data.title,
      description: data.description,
      startTime: Timestamp.fromDate(startDate),
      endTime: Timestamp.fromDate(endDate),
      timezone: data.timezone,
      hostUid: user.uid,
      inviteCode,
      groupId: data.groupId ?? null,
      groupTitle: groupMeta?.groupTitle ?? null,
      createdAt: Timestamp.fromDate(new Date()),
    };
    await setDoc(meetingRef, {
      ...meetingData,
      createdAt: serverTimestamp(),
    });

    const participantProfile = await resolveParticipantProfile(user);
    await upsertParticipant(meetingRef.id, participantProfile);
    const spansMonth =
      startDate.getFullYear() !== endDate.getFullYear() ||
      startDate.getMonth() !== endDate.getMonth();
    const sourceEvents = spansMonth
      ? await readBucketEvents(user.uid, startDate, endDate)
      : await readMonthBucketEvents(user.uid, startDate);
    const scopedEvents = sourceEvents.filter(
      (event) =>
        event.endTime.toDate() >= startDate &&
        event.startTime.toDate() <= endDate,
    );
    const busyBlocks = buildBusyBlocks(scopedEvents, []);
    await setDoc(
      doc(db, 'meetings', meetingRef.id, 'availability', user.uid),
      {
        uid: user.uid,
        busyBlocks,
        manualBlocks: [],
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    );

    if (data.groupId) {
      const groupMembers = await getGroupMembers(data.groupId);
      await Promise.all(
        groupMembers.map(async (member) => {
          if (member.uid === user.uid) return;
          await upsertParticipant(meetingRef.id, {
            uid: member.uid,
            email: member.email,
            displayName: member.displayName,
            nickname: member.nickname,
            photoURL: member.photoURL,
          });
          await seedAvailability(meetingRef.id, member.uid);
        }),
      );
    }

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
    const user = ensureUser();
    await joinMeetingWithMeeting(meeting, user);
    return { data: { id: meeting.id } };
  },

  leaveMeetingByCode: async (inviteCode: string) => {
    const user = ensureUser();
    const meeting = await fetchMeetingByInviteCode(inviteCode);
    if (!meeting) {
      throw new Error('약속을 찾을 수 없습니다.');
    }

    await Promise.all([
      deleteDoc(doc(db, 'meetings', meeting.id, 'participants', user.uid)),
      deleteDoc(doc(db, 'meetings', meeting.id, 'availability', user.uid)),
    ]);

    return { data: true };
  },

  getMeetingDetail: async (meetingId: string) => {
    const meetingRef = doc(db, 'meetings', meetingId);
    const snapshot = await getDoc(meetingRef);
    if (!snapshot.exists()) {
      throw new Error('약속을 찾을 수 없습니다.');
    }
    return {
      data: meetingToClient({
        id: snapshot.id,
        ...(snapshot.data() as MeetingDoc),
      }),
    };
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
    await joinMeetingWithMeeting(meeting, user);

    return { data: true };
  },

  deleteMeetingByCode: async (inviteCode: string) => {
    const user = ensureUser();
    const meeting = await fetchMeetingByInviteCode(inviteCode);
    if (!meeting) {
      throw new Error('약속을 찾을 수 없습니다.');
    }
    if (meeting.hostUid !== user.uid) {
      throw new Error('삭제 권한이 없습니다.');
    }

    await deleteSubcollection(['meetings', meeting.id, 'participants']);
    await deleteSubcollection(['meetings', meeting.id, 'availability']);
    await deleteDoc(doc(db, 'meetings', meeting.id));

    return { data: true };
  },

  updateManualBlocks: async (meetingId: string, blocks: TimeBlock[]) => {
    const user = ensureUser();
    const meetingRef = doc(db, 'meetings', meetingId);
    const meetingSnap = await getDoc(meetingRef);
    if (!meetingSnap.exists()) {
      throw new Error('약속을 찾을 수 없습니다.');
    }
    const meeting = meetingSnap.data() as MeetingDoc;
    const availability = await upsertAvailability(
      meetingId,
      user.uid,
      meeting.startTime.toDate(),
      meeting.endTime.toDate(),
      blocks,
    );
    return { data: availability };
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

    const missingProfiles = participants.filter(
      (participant) => !participant.nickname || !participant.photoURL,
    );
    if (missingProfiles.length > 0) {
      const profileSnapshots = await Promise.all(
        missingProfiles.map((participant) =>
          getDoc(doc(db, 'users', participant.uid)),
        ),
      );
      const batch = writeBatch(db);
      const currentUid = auth.currentUser?.uid;
      let hasBatchUpdates = false;
      missingProfiles.forEach((participant, index) => {
        const profileSnap = profileSnapshots[index];
        if (!profileSnap.exists()) return;
        const profile = profileSnap.data() as {
          nickname?: string | null;
          photoURL?: string | null;
          email?: string | null;
          displayName?: string | null;
        };
        const nickname =
          participant.nickname ??
          profile.nickname ??
          profile.displayName ??
          profile.email ??
          participant.displayName ??
          participant.email ??
          null;
        const photoURL = participant.photoURL ?? profile.photoURL ?? null;
        participant.nickname = nickname;
        participant.photoURL = photoURL;
        if (currentUid && participant.uid === currentUid) {
          hasBatchUpdates = true;
          batch.set(
            doc(db, 'meetings', meeting.id, 'participants', participant.uid),
            {
              nickname,
              photoURL,
              updatedAt: serverTimestamp(),
            },
            { merge: true },
          );
        }
      });
      if (hasBatchUpdates) {
        await batch.commit();
      }
    }
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
    return { data: { availabilitySlots, availabilityDocs, participants } };
  },

  getMeetingContextByCode: async (inviteCode: string) => {
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
    const currentUid = auth.currentUser?.uid;
    const myAvailability =
      currentUid === undefined
        ? null
        : availabilityDocs.find((docItem) => docItem.uid === currentUid) ??
          null;

    return {
      data: {
        meeting: meetingToClient(meeting),
        participants,
        availabilityDocs,
        availabilitySlots,
        myAvailability,
      },
    };
  },

  getMyMeetings: async () => {
    const user = ensureUser();
    const meetingsRef = collection(db, 'meetings');
    const snapshot = await getDocs(
      query(meetingsRef, where('hostUid', '==', user.uid)),
    );
    const meetings = snapshot.docs.map((docSnap) =>
      meetingToClient({ id: docSnap.id, ...(docSnap.data() as MeetingDoc) }),
    );
    const now = Date.now();
    const upcoming = meetings.filter(
      (meeting) =>
        meeting.endTime && new Date(meeting.endTime).getTime() >= now,
    );
    const past = meetings.filter(
      (meeting) => meeting.endTime && new Date(meeting.endTime).getTime() < now,
    );

    upcoming.sort((a, b) => {
      const aCreated = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const bCreated = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return bCreated - aCreated;
    });

    past.sort((a, b) => {
      const aStart = a.startTime ? new Date(a.startTime).getTime() : 0;
      const bStart = b.startTime ? new Date(b.startTime).getTime() : 0;
      return aStart - bStart;
    });

    const sorted = [...upcoming, ...past];
    return { data: sorted };
  },

  getJoinedMeetings: async () => {
    const user = ensureUser();
    const participantsSnap = await getDocs(
      query(collectionGroup(db, 'participants'), where('uid', '==', user.uid)),
    );

    const meetingIds = Array.from(
      new Set(
        participantsSnap.docs
          .map((docSnap) => docSnap.ref.parent.parent?.id)
          .filter((id): id is string => Boolean(id)),
      ),
    );

    const meetingDocs = await Promise.all(
      meetingIds.map((meetingId) => getDoc(doc(db, 'meetings', meetingId))),
    );

    const meetings = meetingDocs
      .filter((docSnap) => docSnap.exists())
      .map((docSnap) =>
        meetingToClient({ id: docSnap.id, ...(docSnap.data() as MeetingDoc) }),
      )
      .filter((meeting) => meeting.hostUid !== user.uid);

    const now = Date.now();
    const upcoming = meetings.filter(
      (meeting) =>
        meeting.endTime && new Date(meeting.endTime).getTime() >= now,
    );
    const past = meetings.filter(
      (meeting) => meeting.endTime && new Date(meeting.endTime).getTime() < now,
    );

    upcoming.sort((a, b) => {
      const aCreated = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const bCreated = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return bCreated - aCreated;
    });

    past.sort((a, b) => {
      const aStart = a.startTime ? new Date(a.startTime).getTime() : 0;
      const bStart = b.startTime ? new Date(b.startTime).getTime() : 0;
      return aStart - bStart;
    });

    const sorted = [...upcoming, ...past];
    return { data: sorted };
  },

  getMeetingsByGroup: async (groupId: string) => {
    const meetingsRef = collection(db, 'meetings');
    const snapshot = await getDocs(
      query(meetingsRef, where('groupId', '==', groupId)),
    );
    const meetings = snapshot.docs.map((docSnap) =>
      meetingToClient({ id: docSnap.id, ...(docSnap.data() as MeetingDoc) }),
    );
    meetings.sort((a, b) => {
      const aStart = a.startTime ? new Date(a.startTime).getTime() : 0;
      const bStart = b.startTime ? new Date(b.startTime).getTime() : 0;
      return aStart - bStart;
    });
    return { data: meetings };
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
