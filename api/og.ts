import type { VercelRequest, VercelResponse } from '@vercel/node';
import { initializeApp, getApps } from 'firebase/app';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  limit,
  query,
  where,
} from 'firebase/firestore';

type Meta = { title: string; description: string };

const DEFAULT_META: Meta = {
  title: 'MyTT',
  description: '약속 잡기와 일정 공유를 한 곳에서',
};

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const encodeKey = (value: string) =>
  encodeURIComponent(value).replace(/\./g, '%2E');

const buildShareLinkDocId = (uid: string, linkId: string) =>
  `${encodeKey(uid)}__${encodeKey(linkId)}`;

const getDb = () => {
  const app =
    getApps()[0] ??
    initializeApp({
      apiKey: process.env.VITE_FIREBASE_API_KEY,
      authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN,
      projectId: process.env.VITE_FIREBASE_PROJECT_ID,
      storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET,
      messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
      appId: process.env.VITE_FIREBASE_APP_ID,
      measurementId: process.env.VITE_FIREBASE_MEASUREMENT_ID,
    });
  return getFirestore(app);
};

const getMeetingMeta = async (inviteCode: string): Promise<Meta> => {
  const db = getDb();
  const snapshot = await getDocs(
    query(collection(db, 'meetings'), where('inviteCode', '==', inviteCode), limit(1)),
  );
  const item = snapshot.docs[0]?.data() as
    | { title?: string; description?: string }
    | undefined;
  return {
    title: item?.title || DEFAULT_META.title,
    description: item?.description || DEFAULT_META.description,
  };
};

const getGroupByInviteMeta = async (inviteCode: string): Promise<Meta> => {
  const db = getDb();
  const snapshot = await getDocs(
    query(collection(db, 'groups'), where('inviteCode', '==', inviteCode), limit(1)),
  );
  const item = snapshot.docs[0]?.data() as { title?: string } | undefined;
  const title = item?.title || DEFAULT_META.title;
  return {
    title,
    description: `지금 바로 MyTT의 ${title} 그룹에서 약속을 잡아보세요!`,
  };
};

const getGroupMeta = async (groupId: string): Promise<Meta> => {
  const db = getDb();
  const snapshot = await getDoc(doc(db, 'groups', groupId));
  const item = snapshot.exists()
    ? (snapshot.data() as { title?: string; description?: string })
    : null;
  return {
    title: item?.title || DEFAULT_META.title,
    description: item?.description || '약속 잡기는 MyTT',
  };
};

const getSharedScheduleMeta = async (uid: string, linkId: string): Promise<Meta> => {
  const db = getDb();
  const linkDocId = buildShareLinkDocId(uid, linkId);
  const linkSnap = await getDoc(doc(db, 'shareLinks', linkDocId));
  if (!linkSnap.exists()) {
    return DEFAULT_META;
  }
  const userSnap = await getDoc(doc(db, 'users', uid));
  const user = userSnap.exists()
    ? (userSnap.data() as { nickname?: string | null; email?: string | null; displayName?: string | null })
    : null;
  const nickname = user?.nickname || user?.displayName || user?.email || '사용자';
  return {
    title: `${nickname}님의 일정`,
    description: `지금 바로 MyTT에서 ${nickname}님의 일정을 확인해 보세요!`,
  };
};

const resolveMeta = async (pathname: string): Promise<Meta> => {
  const segments = pathname.split('/').filter(Boolean);
  if (segments[0] === 'meeting' && segments[1]) {
    return getMeetingMeta(segments[1]);
  }
  if (segments[0] === 'group' && segments[1] === 'invite' && segments[2]) {
    return getGroupByInviteMeta(segments[2]);
  }
  if (segments[0] === 'group' && segments[1]) {
    return getGroupMeta(segments[1]);
  }
  if (segments[0] === 'schedule' && segments[1] === 'view' && segments[2] && segments[3]) {
    return getSharedScheduleMeta(segments[2], segments[3]);
  }
  return DEFAULT_META;
};

const renderHtml = (meta: Meta, url: string) => {
  const title = escapeHtml(meta.title);
  const description = escapeHtml(meta.description);
  const safeUrl = escapeHtml(url);
  return `<!doctype html>
<html lang="ko">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${title}</title>
    <meta name="description" content="${description}" />
    <meta property="og:title" content="${title}" />
    <meta property="og:description" content="${description}" />
    <meta property="og:image" content="/preview.png" />
    <meta property="og:url" content="${safeUrl}" />
    <meta property="og:type" content="website" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${title}" />
    <meta name="twitter:description" content="${description}" />
    <meta name="twitter:image" content="/preview.png" />
  </head>
  <body>
    <p>MyTT</p>
  </body>
</html>`;
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const rawPath = typeof req.query.path === 'string' ? req.query.path : '/';
    const pathname = rawPath.startsWith('/') ? rawPath : `/${rawPath}`;
    const host = req.headers.host ?? 'mytt.vercel.app';
    const protocol = (req.headers['x-forwarded-proto'] as string) || 'https';
    const fullUrl = `${protocol}://${host}${pathname}`;
    const meta = await resolveMeta(pathname);

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=300');
    res.status(200).send(renderHtml(meta, fullUrl));
  } catch {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.status(200).send(renderHtml(DEFAULT_META, 'https://mytt.vercel.app'));
  }
}
