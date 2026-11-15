import Link from 'next/link';
import type { ReactNode } from 'react';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';

interface AuthCardProps {
  title: string;
  description: string;
  footer: { text: string; linkLabel: string; href: string };
  children: ReactNode;
}

export function AuthCard({ title, description, footer, children }: AuthCardProps) {
  return (
    <main className="bg-muted/40 flex min-h-svh items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <p className="text-muted-foreground text-sm font-semibold tracking-tight">TeamBoard</p>
          <CardTitle className="text-2xl">
            <h1>{title}</h1>
          </CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        <CardContent>{children}</CardContent>
        <CardFooter className="text-muted-foreground justify-center text-sm">
          {footer.text}&nbsp;
          <Link href={footer.href} className="text-foreground font-medium underline underline-offset-4">
            {footer.linkLabel}
          </Link>
        </CardFooter>
      </Card>
    </main>
  );
}
