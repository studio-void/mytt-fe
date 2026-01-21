import apiClient from './apiClient';

export const calendarApi = {
  syncCalendar: async () => {
    const response = await apiClient.post('/calendar/sync');
    return response.data;
  },

  getEvents: async (startDate: Date, endDate: Date) => {
    const response = await apiClient.get('/calendar/events', {
      params: {
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
      },
    });
    return response.data;
  },

  getEvent: async (eventId: string) => {
    const response = await apiClient.get(`/calendar/events/${eventId}`);
    return response.data;
  },

  deleteEvent: async (eventId: string) => {
    const response = await apiClient.delete(`/calendar/events/${eventId}`);
    return response.data;
  },
};
