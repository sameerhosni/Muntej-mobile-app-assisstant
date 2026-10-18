import { z } from 'zod';

/** Saudi mobile: accepts 5XXXXXXXX, 05XXXXXXXX, 9665XXXXXXXX or +9665XXXXXXXX → +9665XXXXXXXX. */
export function normalizeSaudiPhone(input: string): string | null {
  const digits = input.replace(/[^\d]/g, '').replace(/^00/, '');
  let local = digits;
  if (local.startsWith('966')) local = local.slice(3);
  if (local.startsWith('0')) local = local.slice(1);
  return /^5\d{8}$/.test(local) ? `+966${local}` : null;
}

export const phoneSchema = z.object({
  phone: z.string().refine((v) => normalizeSaudiPhone(v) !== null, { message: 'auth.invalidPhone' }),
});

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

export type PhoneForm = z.infer<typeof phoneSchema>;
export type EmailForm = z.infer<typeof emailSchema>;
export type OtpForm = z.infer<typeof otpSchema>;
