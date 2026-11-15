import { loginInputSchema, registerInputSchema } from '@teamboard/shared';
import { createZodDto } from '../common/zod-dto';

export class RegisterDto extends createZodDto(registerInputSchema) {}
export class LoginDto extends createZodDto(loginInputSchema) {}
