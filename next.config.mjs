/** @type {import('next').NextConfig} */
const nextConfig = {
  // Prevent Next.js from bundling these on the server — they need native Node.js resolution
  serverExternalPackages: ['@prisma/client', 'bcryptjs'],
};

export default nextConfig;
