import apiClient from './apiClient';

export const meetingApi = {
  createMeeting: async (data: {
    title: string;
    description?: string;
    startTime: string;
    endTime: string;
    timezone?: string;
  }) => {
    const response = await apiClient.post('/meeting', data);
    return response.data;
  },

  joinMeeting: async (inviteCode: string) => {
    const response = await apiClient.post('/meeting/join', { inviteCode });
    return response.data;
  },

  getMeetingDetail: async (meetingId: string) => {
    const response = await apiClient.get(`/meeting/${meetingId}`);
    return response.data;
  },

  getMeetingByCode: async (inviteCode: string) => {
    const response = await apiClient.get(`/meeting/code/${inviteCode}`);
    return response.data;
  },

  updateStatus: async (meetingId: string, status: string) => {
    const response = await apiClient.patch(`/meeting/${meetingId}/status`, {
      status,
    });
    return response.data;
  },

  joinMeetingByCode: async (inviteCode: string) => {
    const response = await apiClient.post(`/meeting/code/${inviteCode}/join`);
    return response.data;
  },

  getMeetingParticipants: async (inviteCode: string) => {
    const response = await apiClient.get(
      `/meeting/code/${inviteCode}/participants`,
    );
    return response.data;
  },

  getMeetingAvailability: async (inviteCode: string) => {
    const response = await apiClient.get(
      `/meeting/code/${inviteCode}/availability`,
    );
    return response.data;
  },
};
