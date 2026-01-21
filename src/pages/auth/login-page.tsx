import { Layout } from '@/components';
import { GoogleLoginButton } from '@/components/auth/google-login-button';

export function LoginPage() {
  return (
    <Layout>
      <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
        <div className="bg-white rounded-lg shadow-lg p-8 max-w-md w-full">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold text-gray-900 mb-2">MyTT</h1>
            <p className="text-gray-600">
              Google Calendar와 함께 약속을 잡으세요
            </p>
          </div>

          <GoogleLoginButton />

          <p className="text-xs text-gray-500 text-center mt-4">
            Google 로그인으로 계속하면 서비스 이용약관에 동의하는 것입니다.
          </p>
        </div>
      </div>
    </Layout>
  );
}
