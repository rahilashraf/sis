const baseUrl =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:3000";

export const apiConfig = {
  baseUrl,
  endpoints: {
    login: `${baseUrl}/auth/login`,
    me: `${baseUrl}/auth/me`,
  },
};