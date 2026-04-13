export const apiConfig = {
  baseUrl: process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:3000",
  endpoints: {
    login: "/auth/login",
    me: "/auth/me",
  },
};
