import { z } from 'zod';

export const emailSchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .pipe(z.email({ message: 'auth.invalidEmail' })),
});

export const otpSchema = z.object({
  // 6 digits from the email, or the temporary 4-digit shared code (supabase/functions/quick-login)
  code: z.string().regex(/^(\d{4}|\d{6})$/, { message: 'auth.invalidCode' }),
});

export type EmailForm = z.infer<typeof emailSchema>;
export type OtpForm = z.infer<typeof otpSchema>;
