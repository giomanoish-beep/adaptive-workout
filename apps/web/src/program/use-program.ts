import { useCallback, useEffect, useMemo, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createProgramRepository } from './program-repository';
import type { LoadedProgram, ProgramAdaptationDto, ProgramSetupDraft } from './program-types';
import { generateProgramViaGateway } from './program-gateway';

export type ProgramState =
  | { readonly status: 'loading' }
  | { readonly status: 'missing' }
  | { readonly status: 'loaded'; readonly program: LoadedProgram }
  | { readonly status: 'error'; readonly message: string };

export function useProgram(client: SupabaseClient) {
  const repository = useMemo(() => createProgramRepository(client), [client]);
  const [state, setState] = useState<ProgramState>({ status: 'loading' });
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      const program = await repository.loadActive();
      setState(program ? { status: 'loaded', program } : { status: 'missing' });
    } catch (error) {
      setState({
        status: 'error',
        message: error instanceof Error ? error.message : 'We could not load your program.',
      });
    }
  }, [repository]);

  useEffect(() => {
    // Repository completion updates state asynchronously; this is the initial subscription load.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void reload();
  }, [reload]);

  const createProgram = useCallback(
    async (setup: ProgramSetupDraft) => {
      setSaving(true);
      setActionError(null);
      try {
        const generated = await generateProgramViaGateway(client, setup);
        if (generated.status === 'error') throw new Error(generated.message);
        await repository.create(setup, generated.program);
        await reload();
        return true;
      } catch (error) {
        setActionError(
          error instanceof Error ? error.message : 'We could not create your program.',
        );
        return false;
      } finally {
        setSaving(false);
      }
    },
    [client, reload, repository],
  );

  const reviseProgram = useCallback(
    async (current: LoadedProgram, setup: ProgramSetupDraft) => {
      setSaving(true);
      setActionError(null);
      try {
        const generated = await generateProgramViaGateway(client, setup);
        if (generated.status === 'error') throw new Error(generated.message);
        await repository.revise(current, setup, generated.program, 'program_preferences_changed');
        await reload();
        return true;
      } catch (error) {
        setActionError(
          error instanceof Error ? error.message : 'We could not revise your program.',
        );
        return false;
      } finally {
        setSaving(false);
      }
    },
    [client, reload, repository],
  );

  const act = useCallback(
    async (operation: () => Promise<void>) => {
      setSaving(true);
      setActionError(null);
      try {
        await operation();
        await reload();
        return true;
      } catch (error) {
        setActionError(error instanceof Error ? error.message : 'The change could not be saved.');
        return false;
      } finally {
        setSaving(false);
      }
    },
    [reload],
  );

  return {
    state,
    saving,
    actionError,
    reload,
    createProgram,
    reviseProgram,
    reschedule: (id: string, date: string) => act(() => repository.reschedule(id, date)),
    skip: (id: string) => act(() => repository.skip(id)),
    addAdaptation: (programId: string, input: Omit<ProgramAdaptationDto, 'id'>) =>
      act(() => repository.addAdaptation(programId, input)),
    removeAdaptation: (id: string) => act(() => repository.removeAdaptation(id)),
  };
}
