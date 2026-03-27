import "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      orgId: string;
      role: string;
      soulCompleted?: boolean;
      name?: string | null;
      email?: string | null;
      image?: string | null;
    };
  }

  interface User {
    orgId?: string;
    role?: string;
    soulCompleted?: boolean;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    orgId?: string;
    role?: string;
    soulCompleted?: boolean;
  }
}
