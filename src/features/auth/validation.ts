import { z } from 'zod';

export const emailSchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .pipe(z.email({ message: 'auth.invalidEmail' })),
});

export const otpSchema = z.object({
  code: z.string().regex(/^\d{6}$/, { message: 'auth.invalidCode' }),
});

export type EmailForm = z.infer<typeof emailSchema>;
export type OtpForm = z.infer<typeof otpSchema>;
