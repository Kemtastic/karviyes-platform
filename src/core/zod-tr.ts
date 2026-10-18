import { z, type ZodErrorMap } from 'zod';

// Kullanıcıya görünen doğrulama mesajları Türkçe.
export const trErrorMap: ZodErrorMap = (issue, ctx) => {
  switch (issue.code) {
    case z.ZodIssueCode.invalid_type:
      return { message: issue.received === 'undefined' || issue.received === 'null' ? 'Bu alan zorunlu.' : 'Geçersiz değer.' };
    case z.ZodIssueCode.too_small:
      if (issue.type === 'string') return { message: `En az ${issue.minimum} karakter olmalı.` };
      if (issue.type === 'array') return { message: `En az ${issue.minimum} seçim yapın.` };
      return { message: `En az ${issue.minimum} olmalı.` };
    case z.ZodIssueCode.too_big:
      if (issue.type === 'string') return { message: `En çok ${issue.maximum} karakter olabilir.` };
      return { message: `En çok ${issue.maximum} olabilir.` };
    case z.ZodIssueCode.invalid_string:
      return { message: issue.validation === 'email' ? 'Geçerli bir e-posta girin.' : 'Biçim geçersiz.' };
    case z.ZodIssueCode.invalid_enum_value:
      return { message: 'Listeden bir seçim yapın.' };
    default:
      return { message: ctx.defaultError };
  }
};
