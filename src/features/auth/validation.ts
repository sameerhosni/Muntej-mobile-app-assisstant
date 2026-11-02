import { z } from 'zod';

export const emailSchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    // an email, or the super admin's username (src/features/auth/adminLogin.ts)
    .refine((v) => v === 'supermuntej' || z.email().safeParse(v).success, { message: 'auth.invalidEmail' }),
});

export const otpSchema = z.object({
  // 6 digits from the email, or the temporary 4-digit shared code (supabase/functions/quick-login)
  code: z.string().regex(/^(\d{4}|\d{6})$/, { message: 'auth.invalidCode' }),
});

export type EmailForm = z.infer<typeof emailSchema>;
export type OtpForm = z.infer<typeof otpSchema>;
