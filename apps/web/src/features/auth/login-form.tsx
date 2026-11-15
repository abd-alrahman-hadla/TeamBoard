'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { type LoginInput, loginInputSchema } from '@teamboard/shared';
import { Loader2Icon } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Button } from '@/components/ui/button';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { FormAlert } from './form-alert';
import { toFormErrors } from './form-errors';

const FIELDS = ['email', 'password'] as const;

interface LoginFormProps {
  onSubmit: (input: LoginInput) => Promise<unknown>;
}

export function LoginForm({ onSubmit }: LoginFormProps) {
  const [formError, setFormError] = useState<string | null>(null);
  const form = useForm<LoginInput>({
    resolver: zodResolver(loginInputSchema),
    defaultValues: { email: '', password: '' },
  });

  const submit = form.handleSubmit(async (values) => {
    setFormError(null);
    try {
      await onSubmit(values);
    } catch (error) {
      const result = toFormErrors(error, FIELDS);
      for (const { field, message } of result.fieldErrors) {
        form.setError(field as keyof LoginInput, { message });
      }
      setFormError(result.formError);
    }
  });

  return (
    <Form {...form}>
      <form onSubmit={(event) => void submit(event)} noValidate className="space-y-4">
        <FormAlert message={formError} />
        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Email</FormLabel>
              <FormControl>
                <Input type="email" autoComplete="email" autoFocus {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="password"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Password</FormLabel>
              <FormControl>
                <Input type="password" autoComplete="current-password" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type="submit" className="w-full" disabled={form.formState.isSubmitting}>
          {form.formState.isSubmitting && <Loader2Icon className="animate-spin" aria-hidden />}
          Sign in
        </Button>
      </form>
    </Form>
  );
}
