import { useEditorState, type Editor } from '@tiptap/react';
import type { ReactNode } from 'react';
import { Icon } from './Icon';

type Level = 1 | 2 | 3;

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.userAgent);
const mod = isMac ? '⌘' : 'Ctrl+';

function Tool({
  label,
  shortcut,
  active = false,
  disabled = false,
  onClick,
  children,
}: {
  label: string;
  shortcut?: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      className="tool"
      aria-label={label}
      aria-pressed={active}
      data-tip={shortcut ? `${label}  ${shortcut}` : label}
      disabled={disabled}
      // Keep the text selection in the editor when a tool is clicked
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

export function Toolbar({ editor }: { editor: Editor }) {
  // TipTap 3 doesn't re-render on every transaction, so subscribe to just what the toolbar shows.
  const state = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      bold: e.isActive('bold'),
      italic: e.isActive('italic'),
      underline: e.isActive('underline'),
      strike: e.isActive('strike'),
      heading: ([1, 2, 3] as Level[]).find((level) => e.isActive('heading', { level })) ?? 0,
      bulletList: e.isActive('bulletList'),
      orderedList: e.isActive('orderedList'),
      blockquote: e.isActive('blockquote'),
      canUndo: e.can().undo(),
      canRedo: e.can().redo(),
    }),
  });

  const chain = () => editor.chain().focus();

  return (
    <div className="toolbar" role="toolbar" aria-label="Formatting">
      <label className="tool-style">
        <span className="visually-hidden">Text style</span>
        <select
          value={state.heading}
          onChange={(e) => {
            const level = Number(e.target.value) as Level | 0;
            if (level === 0) chain().setParagraph().run();
            else chain().setHeading({ level }).run();
          }}
        >
          <option value={0}>Body</option>
          <option value={1}>Title</option>
          <option value={2}>Heading</option>
          <option value={3}>Subheading</option>
        </select>
      </label>

      <span className="tool-rule" />

      <Tool label="Bold" shortcut={`${mod}B`} active={state.bold} onClick={() => chain().toggleBold().run()}>
        <b>B</b>
      </Tool>
      <Tool label="Italic" shortcut={`${mod}I`} active={state.italic} onClick={() => chain().toggleItalic().run()}>
        <i>I</i>
      </Tool>
      <Tool
        label="Underline"
        shortcut={`${mod}U`}
        active={state.underline}
        onClick={() => chain().toggleUnderline().run()}
      >
        <u>U</u>
      </Tool>
      <Tool label="Strikethrough" active={state.strike} onClick={() => chain().toggleStrike().run()}>
        <s>S</s>
      </Tool>

      <span className="tool-rule" />

      <Tool label="Bulleted list" active={state.bulletList} onClick={() => chain().toggleBulletList().run()}>
        <Icon name="bulletList" />
      </Tool>
      <Tool label="Numbered list" active={state.orderedList} onClick={() => chain().toggleOrderedList().run()}>
        <Icon name="orderedList" />
      </Tool>
      <Tool label="Quote" active={state.blockquote} onClick={() => chain().toggleBlockquote().run()}>
        <Icon name="quote" />
      </Tool>

      <span className="tool-rule" />

      <Tool label="Undo" shortcut={`${mod}Z`} disabled={!state.canUndo} onClick={() => chain().undo().run()}>
        <Icon name="undo" />
      </Tool>
      <Tool
        label="Redo"
        shortcut={isMac ? '⇧⌘Z' : 'Ctrl+Y'}
        disabled={!state.canRedo}
        onClick={() => chain().redo().run()}
      >
        <Icon name="redo" />
      </Tool>
    </div>
  );
}
