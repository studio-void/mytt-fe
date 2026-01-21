import apiClient from './apiClient';

export const sharingApi = {
  getSettings: async () => {
    const response = await apiClient.get('/sharing/settings');
    return response.data;
  },

  updateSettings: async (data: {
    privacyLevel: 'busy_only' | 'basic_info' | 'full_details';
  }) => {
    const response = await apiClient.put('/sharing/settings', data);
    return response.data;
  },

  getUserSchedule: async (userId: number) => {
    const response = await apiClient.get(`/sharing/schedule/${userId}`);
    return response.data;
  },
};
