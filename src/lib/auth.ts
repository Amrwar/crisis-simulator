import { getIronSession } from 'iron-session';
import { cookies } from 'next/headers';

export interface SessionData {
  userId?: string;
  email?: string;
  name?: string;
}

const sessionOptions = {
  password: process.env.SESSION_SECRET || 'crisis-sim-default-secret-key-32-chars-min!!',
  cookieName: 'crisis-sim-session',
  cookieOptions: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 60 * 60 * 24 * 7, // 7 days
  },
};

export async function getSession() {
  const cookieStore = cookies();
  return getIronSession<SessionData>(cookieStore, sessionOptions);
}

export async function requireAuth() {
  const session = await getSession();
  if (!session.userId) {
    return null;
  }
  return session;
}
