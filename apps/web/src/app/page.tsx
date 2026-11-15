import { redirect } from 'next/navigation';
import { HOME_PATH } from '@/features/auth/route-guard';

export default function RootPage(): never {
  redirect(HOME_PATH);
}
