import { useEffect, useState } from 'react';

import { useNavigate } from '@tanstack/react-router';
import { toast } from 'sonner';

import { Layout } from '@/components';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { authApi } from '@/services/api/authApi';
import { useAuthStore } from '@/store/useAuthStore';

export function SettingsPage() {
  const navigate = useNavigate();
  const { isAuthenticated, isAuthReady, user } = useAuthStore();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [nickname, setNickname] = useState('');
  const [photoURL, setPhotoURL] = useState('');
  const [email, setEmail] = useState('');

  useEffect(() => {
    if (!isAuthReady) return;
    if (!isAuthenticated) {
      navigate({ to: '/auth/login', search: { redirect: '/settings' } });
      return;
    }
    loadProfile();
  }, [isAuthenticated, isAuthReady, navigate]);

  const loadProfile = async () => {
    try {
      setLoading(true);
      const profile = await authApi.getProfile();
      setNickname(profile.nickname ?? profile.email ?? '');
      setPhotoURL(profile.photoURL ?? '');
      setEmail(profile.email ?? '');
    } catch (error) {
      console.error('Error loading profile:', error);
      toast.error('프로필 정보를 불러오는데 실패했습니다.');
      setNickname(user?.nickname ?? user?.email ?? '');
      setPhotoURL(user?.photoURL ?? '');
      setEmail(user?.email ?? '');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    const nextNickname = nickname.trim();
    if (!nextNickname) {
      toast.error('닉네임을 입력해주세요.');
      return;
    }
    try {
      setSaving(true);
      await authApi.updateUserProfile({
        nickname: nextNickname,
        photoURL: photoURL.trim() || null,
      });
      toast.success('프로필이 저장되었습니다.');
    } catch (error) {
      console.error('Error saving profile:', error);
      toast.error('프로필 저장에 실패했습니다.');
    } finally {
      setSaving(false);
    }
  };

  const displayName =
    nickname.trim() ||
    user?.nickname ||
    user?.email ||
    user?.displayName ||
    '사용자';

  if (loading) {
    return (
      <Layout disableHeaderHeight>
        <div className="mx-auto py-16">
          <div className="text-center">로딩 중...</div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout disableHeaderHeight>
      <div className="mx-auto py-16 max-w-2xl">
        <div className="mb-8">
          <h1 className="text-2xl sm:text-3xl font-extrabold mb-2">설정</h1>
          <p className="text-gray-600 text-sm sm:text-base">
            프로필 사진과 닉네임을 변경할 수 있습니다.
          </p>
        </div>

        <div className="border border-gray-200 rounded-lg p-6 space-y-6">
          <div className="flex items-center gap-4">
            <span className="inline-flex h-16 w-16 items-center justify-center overflow-hidden rounded-full border border-gray-200 bg-gray-100 text-sm font-semibold text-gray-600">
              {photoURL ? (
                <img
                  src={photoURL}
                  alt={displayName}
                  className="h-full w-full object-cover"
                />
              ) : (
                displayName.slice(0, 2).toUpperCase()
              )}
            </span>
            <div>
              <p className="text-sm text-gray-500">미리보기</p>
              <p className="text-base font-semibold text-gray-800">
                {displayName}
              </p>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700">
              닉네임
            </label>
            <Input
              value={nickname}
              onChange={(event) => setNickname(event.target.value)}
              placeholder="표시할 닉네임을 입력하세요"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700">
              프로필 사진 URL
            </label>
            <Input
              value={photoURL}
              onChange={(event) => setPhotoURL(event.target.value)}
              placeholder="https://example.com/profile.jpg"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700">이메일</label>
            <Input value={email} readOnly className="bg-gray-50" />
          </div>

          <div className="flex justify-end">
            <Button onClick={handleSave} disabled={saving}>
              {saving ? '저장 중...' : '저장하기'}
            </Button>
          </div>
        </div>
      </div>
    </Layout>
  );
}
