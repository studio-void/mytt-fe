import type { User } from 'firebase/auth';
import {
  type FieldValue,
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

export type GroupRole = 'master' | 'manager' | 'member';

interface GroupDoc {
  title: string;
  description?: string;
  inviteCode: string;
  masterUid: string;
  createdAt?: Timestamp | FieldValue;
  updatedAt?: Timestamp | FieldValue;
}

interface GroupMemberDoc {
  uid: string;
  role: GroupRole;
  email: string | null;
  displayName: string | null;
  nickname: string | null;
  photoURL: string | null;
  joinedAt?: Timestamp | FieldValue;
}

const ensureUser = () => {
  if (!auth.currentUser) {
    throw new Error('로그인이 필요합니다.');
  }
  return auth.currentUser;
};

const buildFallbackNickname = (user: User) =>
  user.displayName ?? user.email ?? null;

const resolveMemberProfile = async (
  user: User,
): Promise<Pick<GroupMemberDoc, 'nickname' | 'photoURL'>> => {
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

  return { nickname, photoURL };
};

const generateInviteCode = () => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i += 1) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
};

const fetchGroupByInviteCode = async (inviteCode: string) => {
  const groupsRef = collection(db, 'groups');
  const snapshot = await getDocs(
    query(groupsRef, where('inviteCode', '==', inviteCode)),
  );
  const docSnap = snapshot.docs[0];
  if (!docSnap) {
    return null;
  }
  return { id: docSnap.id, ...(docSnap.data() as GroupDoc) };
};

const generateUniqueInviteCode = async () => {
  let attempts = 0;
  while (attempts < 5) {
    const code = generateInviteCode();
    const existing = await fetchGroupByInviteCode(code);
    if (!existing) {
      return code;
    }
    attempts += 1;
  }
  return generateInviteCode();
};

const groupToClient = (group: { id: string } & GroupDoc) => ({
  id: group.id,
  title: group.title,
  description: group.description,
  inviteCode: group.inviteCode,
  masterUid: group.masterUid,
  createdAt:
    group.createdAt && 'toDate' in group.createdAt
      ? group.createdAt.toDate().toISOString()
      : null,
  updatedAt:
    group.updatedAt && 'toDate' in group.updatedAt
      ? group.updatedAt.toDate().toISOString()
      : null,
});

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

export const groupApi = {
  createGroup: async (data: { title: string; description?: string }) => {
    const user = ensureUser();
    const inviteCode = await generateUniqueInviteCode();
    const groupRef = doc(collection(db, 'groups'));
    const groupData: GroupDoc = {
      title: data.title,
      ...(data.description ? { description: data.description } : {}),
      inviteCode,
      masterUid: user.uid,
      createdAt: serverTimestamp() as Timestamp,
      updatedAt: serverTimestamp() as Timestamp,
    };
    await setDoc(groupRef, groupData);

    const memberProfile = await resolveMemberProfile(user);
    const memberRef = doc(db, 'groups', groupRef.id, 'members', user.uid);
    await setDoc(
      memberRef,
      {
        uid: user.uid,
        role: 'master',
        email: user.email,
        displayName: user.displayName,
        nickname: memberProfile.nickname,
        photoURL: memberProfile.photoURL,
        joinedAt: serverTimestamp(),
      } satisfies GroupMemberDoc,
      { merge: true },
    );

    return {
      data: {
        ...groupToClient({
          id: groupRef.id,
          ...groupData,
          createdAt: Timestamp.fromDate(new Date()),
          updatedAt: Timestamp.fromDate(new Date()),
        }),
      },
    };
  },

  getMyGroups: async () => {
    const user = ensureUser();
    const membersSnap = await getDocs(
      query(collectionGroup(db, 'members'), where('uid', '==', user.uid)),
    );

    const memberships = membersSnap.docs
      .map((docSnap) => ({
        groupId: docSnap.ref.parent.parent?.id ?? '',
        role: (docSnap.data() as GroupMemberDoc).role,
      }))
      .filter((item) => item.groupId);

    const groupDocs = await Promise.all(
      memberships.map((membership) =>
        getDoc(doc(db, 'groups', membership.groupId)),
      ),
    );

    const groups = groupDocs
      .map((docSnap, index) => {
        if (!docSnap.exists()) return null;
        const group = groupToClient({
          id: docSnap.id,
          ...(docSnap.data() as GroupDoc),
        });
        return { ...group, role: memberships[index].role };
      })
      .filter(
        (
          item,
        ): item is ReturnType<typeof groupToClient> & { role: GroupRole } =>
          Boolean(item),
      );

    return { data: groups };
  },

  getGroupById: async (groupId: string) => {
    const snapshot = await getDoc(doc(db, 'groups', groupId));
    if (!snapshot.exists()) {
      throw new Error('그룹을 찾을 수 없습니다.');
    }
    return {
      data: groupToClient({ id: snapshot.id, ...(snapshot.data() as GroupDoc) }),
    };
  },

  getGroupByInviteCode: async (inviteCode: string) => {
    const group = await fetchGroupByInviteCode(inviteCode);
    if (!group) {
      throw new Error('그룹을 찾을 수 없습니다.');
    }
    return { data: groupToClient(group) };
  },

  getGroupMembers: async (groupId: string) => {
    const membersRef = collection(db, 'groups', groupId, 'members');
    const snapshot = await getDocs(query(membersRef, orderBy('joinedAt')));
    const members = snapshot.docs.map((docSnap) =>
      docSnap.data() as GroupMemberDoc,
    );
    return { data: members };
  },

  joinGroupByInviteCode: async (inviteCode: string) => {
    const user = ensureUser();
    const group = await fetchGroupByInviteCode(inviteCode);
    if (!group) {
      throw new Error('그룹을 찾을 수 없습니다.');
    }

    const memberRef = doc(db, 'groups', group.id, 'members', user.uid);
    const existing = await getDoc(memberRef);
    if (existing.exists()) {
      return { data: { groupId: group.id } };
    }

    const memberProfile = await resolveMemberProfile(user);
    await setDoc(
      memberRef,
      {
        uid: user.uid,
        role: 'member',
        email: user.email,
        displayName: user.displayName,
        nickname: memberProfile.nickname,
        photoURL: memberProfile.photoURL,
        joinedAt: serverTimestamp(),
      } satisfies GroupMemberDoc,
      { merge: true },
    );

    return { data: { groupId: group.id } };
  },

  updateMemberRole: async (
    groupId: string,
    memberId: string,
    role: GroupRole,
  ) => {
    const memberRef = doc(db, 'groups', groupId, 'members', memberId);
    await setDoc(memberRef, { role, updatedAt: serverTimestamp() }, { merge: true });
    return { data: { success: true } };
  },

  removeMember: async (groupId: string, memberId: string) => {
    await deleteDoc(doc(db, 'groups', groupId, 'members', memberId));
    return { data: { success: true } };
  },

  updateGroup: async (groupId: string, data: { title: string; description?: string }) => {
    await setDoc(
      doc(db, 'groups', groupId),
      {
        title: data.title,
        ...(data.description ? { description: data.description } : { description: '' }),
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    );
    return { data: { success: true } };
  },

  deleteGroup: async (groupId: string) => {
    await deleteSubcollection(['groups', groupId, 'members']);
    await deleteDoc(doc(db, 'groups', groupId));
    return { data: { success: true } };
  },
};
