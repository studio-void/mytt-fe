import apiClient from './apiClient';

export const authApi = {
  googleLogin: () => {
    window.location.href = `${apiClient.defaults.baseURL}/auth/google/login`;
  },

  getProfile: async () => {
    const response = await apiClient.get('/auth/google/profile');
    return response.data;
  },
};
