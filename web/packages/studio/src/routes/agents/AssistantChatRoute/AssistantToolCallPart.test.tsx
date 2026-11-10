// SPDX-FileCopyrightText: Copyright (c) 2025-2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import {
  ASSISTANT_COLLAPSED_STUDIO_DETAILS_TOOL_NAME,
  ASSISTANT_COLLAPSED_THINKING_TOOL_NAME,
  ASSISTANT_SUBTLE_TOOL_GROUP_NAME,
  ASSISTANT_THINKING_TOOL_NAME,
} from '@nemo/common/src/components/AssistantChat/toolParts';
import { MockToastProvider } from '@nemo/common/src/tests/MockToastProvider';
import { AssistantToolCallPart } from '@studio/routes/agents/AssistantChatRoute/AssistantToolCallPart';
import {
  ASSISTANT_JOB_PROGRESS_MCP_TOOL_NAME,
  ASSISTANT_JOB_PROGRESS_TOOL_NAME,
} from '@studio/routes/agents/AssistantChatRoute/jobProgressConsts';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ComponentProps } from 'react';

vi.mock('@studio/routes/agents/AssistantChatRoute/JobProgressToolCall', () => ({
  JobProgressToolCall: ({ args }: { args: Record<string, unknown> }) => (
    <div data-testid="mock-job-progress">{String(args.job_name)}</div>
  ),
}));

type PartProps = ComponentProps<typeof AssistantToolCallPart>;

const renderPart = async ({
  args,
  toolName,
  ...overrides
}: Pick<PartProps, 'args' | 'toolName'> & Partial<PartProps>) => {
  render(
    <MockToastProvider>
      <AssistantToolCallPart
        addResult={vi.fn()}
        args={args}
        argsText={JSON.stringify(args)}
        resume={vi.fn()}
        status={{ type: 'complete' }}
        toolCallId={`toolu_${toolName}`}
        toolName={toolName}
        type="tool-call"
        {...overrides}
      />
    </MockToastProvider>
  );
  await waitFor(() => {
    for (const code of screen.queryAllByTestId('nv-code-snippet-code')) {
      expect(code).not.toHaveClass('nv-code-snippet-code--loading');
    }
  });
};

const getStepTitles = (container: HTMLElement = document.body) =>
  within(container)
    .getAllByTestId('assistant-work-tool-call')
    .map((step) => within(step).getByTestId('nv-collapsible-trigger').textContent);

interface SubtleToolCase {
  readonly args: Record<string, string>;
  readonly expectedText: string;
  readonly toolName: string;
}

const subtleToolCases: readonly SubtleToolCase[] = [
  {
    args: { command: 'pwd', description: 'check the working directory' },
    expectedText: 'Ran check the working directory',
    toolName: 'Bash',
  },
  {
    args: { question: 'Do you want to continue?' },
    expectedText: 'Asked Do you want to continue?',
    toolName: 'AskUserQuestion',
  },
  {
    args: { query: 'AssistantToolCallPart' },
    expectedText: 'Searched files AssistantToolCallPart',
    toolName: 'FindFiles',
  },
  {
    args: { pattern: 'AssistantToolCallPart' },
    expectedText: 'Searched text AssistantToolCallPart',
    toolName: 'Grep',
  },
  {
    args: { task: 'check the route' },
    expectedText: 'Created task check the route',
    toolName: 'TaskCreate',
  },
  {
    args: { status: 'in_progress' },
    expectedText: 'Updated task in_progress',
    toolName: 'TaskUpdate',
  },
  {
    args: { query: 'read files' },
    expectedText: 'Searched tools read files',
    toolName: 'ToolSearch',
  },
  {
    args: { file_path: 'web/packages/studio/src/App.tsx' },
    expectedText: 'Read App.tsx',
    toolName: 'Read',
  },
  { args: { pattern: '**/*.tsx' }, expectedText: 'Found files **/*.tsx', toolName: 'Glob' },
];

describe('AssistantToolCallPart', () => {
  it.each([ASSISTANT_THINKING_TOOL_NAME, ASSISTANT_COLLAPSED_THINKING_TOOL_NAME])(
    'renders %s as a Thought step',
    async (toolName) => {
      await renderPart({ args: { text: 'Working out which file owns the panel.' }, toolName });

      expect(screen.getByTestId('assistant-work-thought')).toHaveTextContent(
        'ThoughtWorking out which file owns the panel.'
      );
    }
  );

  it.each(subtleToolCases)(
    'renders $toolName as a titled step',
    async ({ args, expectedText, toolName }) => {
      await renderPart({ args, toolName });

      expect(getStepTitles()).toEqual([expectedText]);
      expect(screen.queryByTestId('assistant-work-file-edit')).not.toBeInTheDocument();
    }
  );

  it('renders an unknown tool as a Used step with its arguments and result', async () => {
    await renderPart({
      args: { query: 'symbols' },
      result: { matches: 3 },
      toolName: 'InspectWorkspace',
    });

    const step = screen.getByTestId('assistant-work-tool-call');
    expect(getStepTitles()).toEqual(['Used InspectWorkspace symbols']);
    expect(within(step).getByText('Arguments')).toBeInTheDocument();
    expect(within(step).getByText('Result')).toBeInTheDocument();
  });

  it('labels a running known tool with its running action and a failed result as Error', async () => {
    await renderPart({
      args: { command: 'pwd' },
      isError: true,
      result: 'permission denied',
      status: { type: 'running' },
      toolName: 'Bash',
    });

    const step = screen.getByTestId('assistant-work-tool-call');
    expect(getStepTitles()).toEqual(['Running pwd']);
    expect(within(step).getByText('Error')).toHaveClass('text-feedback-danger');
  });

  it('reveals and copies the exact Bash command instead of its description', async () => {
    const user = userEvent.setup();
    await renderPart({
      args: { command: 'pnpm --filter nemo-studio-ui test', description: 'run Studio tests' },
      toolName: 'Bash',
    });

    const step = screen.getByTestId('assistant-work-tool-call');
    expect(getStepTitles()).toEqual(['Ran run Studio tests']);
    expect(step).not.toHaveAttribute('open');

    await user.click(screen.getByText('run Studio tests'));

    expect(step).toHaveAttribute('open');
    expect(within(step).getByText('Command')).toBeVisible();
    expect(within(step).queryByText('Arguments')).not.toBeInTheDocument();
    expect(step).toHaveTextContent('pnpm --filter nemo-studio-ui test');

    await user.click(within(step).getByRole('button', { name: 'Copy' }));

    expect(await navigator.clipboard.readText()).toBe('pnpm --filter nemo-studio-ui test');
    expect(await screen.findByText('Successfully copied to clipboard!')).toBeInTheDocument();
  });

  it('shows the arguments, not an empty Command, for a Bash call without a command', async () => {
    await renderPart({ args: { description: 'check the working directory' }, toolName: 'Bash' });

    const step = screen.getByTestId('assistant-work-tool-call');
    expect(within(step).getByText('Arguments')).toBeInTheDocument();
    expect(within(step).queryByText('Command')).not.toBeInTheDocument();
    expect(step).toHaveTextContent('"description": "check the working directory"');
  });

  it('renders Write as a file change with its line counts and written content', async () => {
    await renderPart({
      args: {
        content: 'export const value = 1;\nexport const next = 2;\n',
        file_path: 'web/packages/studio/src/routes/agents/NewFile.tsx',
      },
      toolName: 'Write',
    });

    const step = screen.getByTestId('assistant-work-file-edit');
    expect(step).toHaveTextContent('Wrote NewFile.tsx');
    expect(within(step).getByTestId('assistant-work-edit-stats')).toHaveTextContent('+2 −0');
    expect(within(step).getByText('+2')).toHaveClass('text-feedback-success');
    expect(within(step).getByText('−0')).toHaveClass('text-feedback-danger');
    expect(
      within(step).getByText('web/packages/studio/src/routes/agents/NewFile.tsx')
    ).toBeInTheDocument();
    expect(step).toHaveTextContent('export const next = 2;');
  });

  it('renders Edit as a file change with its edited line counts', async () => {
    await renderPart({
      args: {
        file_path: 'web/packages/studio/src/routes/agents/ExistingFile.tsx',
        new_string: 'const label = "new";\n',
        old_string: 'const label = "old";\nconst other = 1;\n',
      },
      toolName: 'Edit',
    });

    const step = screen.getByTestId('assistant-work-file-edit');
    expect(step).toHaveTextContent('Edited ExistingFile.tsx');
    expect(within(step).getByTestId('assistant-work-edit-stats')).toHaveTextContent('+1 −2');
  });

  it('shows a running Write with its running action', async () => {
    await renderPart({
      args: { content: 'export const value = 1;\n', file_path: 'src/NewFile.tsx' },
      status: { type: 'running' },
      toolName: 'Write',
    });

    expect(screen.getByTestId('assistant-work-file-edit')).toHaveTextContent('Writing NewFile.tsx');
  });

  it('renders an unknown tool with file-like arguments as a plain Used step', async () => {
    await renderPart({
      args: { file_path: 'src/notes/MEMORY.md', content: 'Pick up milk' },
      toolName: 'save_note',
    });

    expect(screen.queryByTestId('assistant-work-file-edit')).not.toBeInTheDocument();
    expect(screen.getByTestId('assistant-work-tool-call')).toHaveTextContent('Used save_note');
  });

  it('keeps a failed file write as a tool call so its error shows', async () => {
    await renderPart({
      args: { file_path: 'src/notes/MEMORY.md', content: 'Pick up milk' },
      isError: true,
      result: 'EACCES: permission denied',
      toolName: 'Write',
    });

    expect(screen.queryByTestId('assistant-work-file-edit')).not.toBeInTheDocument();
    const step = screen.getByTestId('assistant-work-tool-call');
    expect(step).toHaveTextContent('Used Write file');
    expect(within(step).getByText('Error')).toBeInTheDocument();
  });

  it('unpacks a subtle tool group into one step per call', async () => {
    await renderPart({
      args: {
        actions: [
          { args: { command: 'pwd' }, toolCallId: 'toolu_bash', toolName: 'Bash' },
          {
            args: { file_path: 'web/packages/studio/src/App.tsx' },
            toolCallId: 'toolu_read',
            toolName: 'Read',
          },
          { args: { pattern: 'TODO' }, toolCallId: 'toolu_grep', toolName: 'Grep' },
        ],
      },
      toolName: ASSISTANT_SUBTLE_TOOL_GROUP_NAME,
    });

    expect(getStepTitles()).toEqual(['Ran pwd', 'Read App.tsx', 'Searched text TODO']);
    expect(screen.queryByTestId('assistant-work-repeated-tool-calls')).not.toBeInTheDocument();
  });

  it('shows the last call of a running subtle group with its running action', async () => {
    await renderPart({
      args: {
        actions: [
          { args: { file_path: 'a.md' }, toolCallId: 'toolu_read', toolName: 'Read' },
          { args: { command: 'pwd' }, toolCallId: 'toolu_bash', toolName: 'Bash' },
        ],
      },
      status: { type: 'running' },
      toolName: ASSISTANT_SUBTLE_TOOL_GROUP_NAME,
    });

    expect(getStepTitles()).toEqual(['Read a.md', 'Running pwd']);
  });

  it('folds repeated calls of one tool into a step per tool, keeping each command', async () => {
    const user = userEvent.setup();
    await renderPart({
      args: {
        actions: [
          {
            args: { command: 'pwd', description: 'check working directory' },
            toolCallId: 'toolu_bash_1',
            toolName: 'Bash',
          },
          {
            args: { command: 'ls', description: 'list files' },
            toolCallId: 'toolu_bash_2',
            toolName: 'Bash',
          },
          { args: { file_path: 'README.md' }, toolCallId: 'toolu_read_1', toolName: 'Read' },
          {
            args: { command: 'git status', description: 'check git status' },
            toolCallId: 'toolu_bash_3',
            toolName: 'Bash',
          },
          {
            args: { command: 'pnpm test', description: 'run tests' },
            toolCallId: 'toolu_bash_4',
            toolName: 'Bash',
          },
          { args: { command: 'pnpm typecheck' }, toolCallId: 'toolu_bash_5', toolName: 'Bash' },
          { args: { file_path: 'package.json' }, toolCallId: 'toolu_read_2', toolName: 'Read' },
          { args: { pattern: 'x', path: 'src' }, toolCallId: 'toolu_grep', toolName: 'Grep' },
        ],
      },
      toolName: ASSISTANT_SUBTLE_TOOL_GROUP_NAME,
    });

    const [commands, reads] = screen.getAllByTestId('assistant-work-repeated-tool-calls');
    expect(commands).toHaveTextContent('Ran 5 commands');
    expect(reads).toHaveTextContent('Read 2 files');
    expect(commands).not.toHaveAttribute('open');
    expect(getStepTitles(commands)).toEqual([
      'Ran check working directory',
      'Ran list files',
      'Ran check git status',
      'Ran run tests',
      'Ran pnpm typecheck',
    ]);
    expect(getStepTitles(reads)).toEqual(['Read README.md', 'Read package.json']);
    expect(getStepTitles()).toContain('Searched text x in src');

    await user.click(within(commands).getByText('Ran 5 commands'));

    expect(commands).toHaveAttribute('open');
    const [, listFiles] = within(commands).getAllByTestId('assistant-work-tool-call');
    await user.click(within(listFiles!).getByText('list files'));

    expect(within(listFiles!).getByText('Command')).toBeVisible();
    expect(listFiles).toHaveTextContent('ls');
  });

  it('unpacks collapsed details into thought, markdown narration, and tool steps', async () => {
    await renderPart({
      args: {
        label: 'worked for 42s',
        parts: [
          { type: 'reasoning', text: 'Plan the optimization report.' },
          {
            type: 'text',
            text: [
              '## Optimization report',
              '',
              '**Current config:** `meta-llama-3-1-70b-instruct`',
              '',
              '- Preserved first suggestion',
              '- Preserved second suggestion',
            ].join('\n'),
          },
          {
            type: 'tool-call',
            args: { command: 'pwd' },
            argsText: '{"command":"pwd"}',
            toolCallId: 'toolu_bash',
            toolName: 'Bash',
          },
          {
            type: 'tool-call',
            args: {
              actions: [
                { args: { file_path: 'a.md' }, toolCallId: 'toolu_read_1', toolName: 'Read' },
                { args: { file_path: 'b.md' }, toolCallId: 'toolu_read_2', toolName: 'Read' },
              ],
            },
            toolCallId: 'toolu_group',
            toolName: ASSISTANT_SUBTLE_TOOL_GROUP_NAME,
          },
        ],
      },
      argsText: '',
      toolName: ASSISTANT_COLLAPSED_STUDIO_DETAILS_TOOL_NAME,
    });

    expect(screen.getByTestId('assistant-work-thought')).toHaveTextContent(
      'Plan the optimization report.'
    );
    expect(screen.getByRole('heading', { level: 2, name: 'Optimization report' })).toBeVisible();
    expect(screen.getByText('Current config:')).toHaveProperty('tagName', 'STRONG');
    expect(screen.getByText('meta-llama-3-1-70b-instruct')).toHaveProperty('tagName', 'CODE');
    expect(screen.getAllByRole('listitem')[0]).toHaveTextContent('Preserved first suggestion');
    expect(getStepTitles()).toEqual(['Ran pwd', 'Read a.md', 'Read b.md']);
    expect(screen.getByTestId('assistant-work-repeated-tool-calls')).toHaveTextContent(
      'Read 2 files'
    );
    expect(screen.queryByText(/worked for/)).not.toBeInTheDocument();
  });

  it.each([ASSISTANT_JOB_PROGRESS_TOOL_NAME, ASSISTANT_JOB_PROGRESS_MCP_TOOL_NAME])(
    'renders %s as a rich job progress tool call',
    async (toolName) => {
      await renderPart({ args: { job_name: 'studio-job-1' }, toolName });

      expect(screen.getByTestId('mock-job-progress')).toHaveTextContent('studio-job-1');
      expect(screen.queryByTestId('assistant-work-tool-call')).not.toBeInTheDocument();
    }
  );
});
