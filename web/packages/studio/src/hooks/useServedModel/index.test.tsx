// SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import { modelsGetProvider } from '@nemo/sdk/generated/platform/model-providers';
import type { ModelEntity } from '@nemo/sdk/generated/platform/schema';
import { useServedModel } from '@studio/hooks/useServedModel';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';

vi.mock('@nemo/sdk/generated/platform/model-providers', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@nemo/sdk/generated/platform/model-providers')>()),
  modelsGetProvider: vi.fn(),
}));

const model = {
  name: 'my-model',
  workspace: 'ws',
  model_providers: ['ws/missing-provider'],
} as ModelEntity;

describe('useServedModel', () => {
  it('does not refetch a provider that failed when another component starts using it', async () => {
    vi.mocked(modelsGetProvider).mockRejectedValue(new Error('404'));
    const queryClient = new QueryClient();
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );

    const { result: first } = renderHook(() => useServedModel(model, 'ws/my-model'), { wrapper });
    await waitFor(() => expect(first.current.isError).toBe(true));

    const { result: second } = renderHook(() => useServedModel(model, 'ws/my-model'), { wrapper });

    expect(second.current.isLoading).toBe(false);
    expect(first.current.isLoading).toBe(false);
    expect(modelsGetProvider).toHaveBeenCalledTimes(1);
  });
});
