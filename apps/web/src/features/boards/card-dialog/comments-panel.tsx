'use client';

import { canDeleteComment, canEditComment, type Comment, type Member, type Role } from '@teamboard/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { type FormEvent, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/features/auth/auth-context';
import { errorMessage } from '@/lib/error-message';
import { addComment, deleteComment, editComment, listComments } from '../board-api';
import { timeAgo } from '../due-date';
import { queryKeys } from '../query-keys';
import { TEMP_PREFIX } from '../use-board-mutations';
import { Markdown } from './markdown';
import { MentionTextarea } from './mention-textarea';

interface CommentsPanelProps {
  cardId: string;
  role: Role | null;
  canComment: boolean;
  now: Date;
  /** Workspace members, for `@` mentions. */
  members: readonly Member[];
}

type Vars =
  { kind: 'add'; body: string } | { kind: 'edit'; id: string; body: string } | { kind: 'delete'; id: string };

function applyLocally(list: Comment[], vars: Vars, author: Comment['author'], cardId: string): Comment[] {
  const at = new Date().toISOString();
  switch (vars.kind) {
    case 'add':
      return [
        ...list,
        {
          id: `${TEMP_PREFIX}${crypto.randomUUID()}`,
          cardId,
          author,
          body: vars.body,
          createdAt: at,
          updatedAt: at,
        },
      ];
    case 'edit':
      return list.map((c) => (c.id === vars.id ? { ...c, body: vars.body, updatedAt: at } : c));
    case 'delete':
      return list.filter((c) => c.id !== vars.id);
  }
}

function send(cardId: string, vars: Vars): Promise<unknown> {
  switch (vars.kind) {
    case 'add':
      return addComment(cardId, vars.body);
    case 'edit':
      return editComment(vars.id, vars.body);
    case 'delete':
      return deleteComment(vars.id);
  }
}

/** Comment thread with optimistic add/edit/delete. Comments are markdown too. */
export function CommentsPanel({ cardId, role, canComment, now, members }: CommentsPanelProps) {
  const queryClient = useQueryClient();
  const { state } = useAuth();
  const me = state.user;
  const key = queryKeys.comments(cardId);
  const comments = useQuery({ queryKey: key, queryFn: () => listComments(cardId) });

  const change = useMutation({
    mutationFn: (vars: Vars) => send(cardId, vars),
    onMutate: async (vars) => {
      await queryClient.cancelQueries({ queryKey: key });
      const before = queryClient.getQueryData<Comment[]>(key);
      const author = me ? { id: me.id, name: me.name } : null;
      queryClient.setQueryData<Comment[]>(key, (list) => applyLocally(list ?? [], vars, author, cardId));
      return { before };
    },
    onError: (error, vars, context) => {
      queryClient.setQueryData(key, context?.before);
      toast.error(errorMessage(error, vars.kind === 'add' ? "Couldn't post your comment." : undefined));
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: key });
      void queryClient.invalidateQueries({ queryKey: queryKeys.cardActivity(cardId) });
    },
  });

  const [draft, setDraft] = useState('');
  const [editing, setEditing] = useState<{ id: string; body: string } | null>(null);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const body = draft.trim();
    if (!body) return;
    change.mutate({ kind: 'add', body });
    setDraft('');
  };

  const saveEdit = () => {
    if (!editing || !editing.body.trim()) return;
    change.mutate({ kind: 'edit', id: editing.id, body: editing.body.trim() });
    setEditing(null);
  };

  return (
    <div className="space-y-4">
      {canComment && (
        <form onSubmit={submit} className="space-y-2">
          <MentionTextarea
            value={draft}
            onValueChange={setDraft}
            members={members}
            meId={me?.id ?? null}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) submit(event);
            }}
            placeholder="Write a comment… (Markdown, @ to mention)"
            aria-label="Write a comment"
            className="min-h-20 text-sm"
            maxLength={5000}
          />
          <Button type="submit" size="sm" disabled={!draft.trim()}>
            Comment
          </Button>
        </form>
      )}

      {comments.isPending && <Skeleton className="h-16 w-full" />}
      {comments.isError && <p className="text-destructive text-sm">Couldn’t load comments.</p>}
      {comments.data?.length === 0 && <p className="text-muted-foreground text-sm">No comments yet.</p>}

      <ol className="space-y-3" aria-label="Comments">
        {[...(comments.data ?? [])].reverse().map((comment) => {
          const authorId = comment.author?.id ?? null;
          const mine = me ? canEditComment(me.id, authorId) : false;
          const deletable = me && role ? canDeleteComment(me.id, role, authorId) : false;
          const pending = comment.id.startsWith(TEMP_PREFIX);
          const isEditing = editing?.id === comment.id;
          return (
            <li key={comment.id} className={pending ? 'opacity-60' : undefined} data-testid="comment">
              <div className="flex items-baseline gap-2 text-xs">
                <span className="font-semibold">{comment.author?.name ?? 'Former member'}</span>
                <time className="text-muted-foreground" dateTime={comment.createdAt}>
                  {timeAgo(comment.createdAt, now)}
                </time>
                {comment.updatedAt !== comment.createdAt && (
                  <span className="text-muted-foreground">(edited)</span>
                )}
              </div>
              {isEditing ? (
                <div className="mt-1 space-y-2">
                  <MentionTextarea
                    autoFocus
                    value={editing.body}
                    onValueChange={(body) => setEditing({ id: comment.id, body })}
                    members={members}
                    meId={me?.id ?? null}
                    onKeyDown={(event) => {
                      if (event.key === 'Escape') {
                        event.stopPropagation();
                        setEditing(null);
                      }
                    }}
                    aria-label="Edit comment"
                    className="min-h-16 text-sm"
                    maxLength={5000}
                  />
                  <div className="flex gap-2">
                    <Button size="sm" disabled={!editing.body.trim()} onClick={saveEdit}>
                      Save
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="bg-muted/50 mt-1 rounded-md px-3 py-2">
                  <Markdown source={comment.body} />
                </div>
              )}
              {!pending && !isEditing && (mine || deletable) && (
                <div className="text-muted-foreground mt-1 flex gap-3 text-xs">
                  {mine && (
                    <button
                      type="button"
                      className="hover:text-foreground underline-offset-2 hover:underline"
                      onClick={() => setEditing({ id: comment.id, body: comment.body })}
                    >
                      Edit
                    </button>
                  )}
                  {deletable && (
                    <button
                      type="button"
                      className="hover:text-destructive underline-offset-2 hover:underline"
                      onClick={() => change.mutate({ kind: 'delete', id: comment.id })}
                    >
                      Delete
                    </button>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
