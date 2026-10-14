/**
 * The right-hand tool panel.
 *
 * Statistics, search and punctuation inspection share the same document and the same panel slot
 * rather than living on separate pages — the text is entered once and inspected from three
 * angles. Switching views never touches the textarea, so nothing is lost.
 */
import { appStore, setActiveTool, type ToolId } from '../app/appState';
import { useStore } from '../app/store';
import { useTranslate } from '../app/useTranslate';
import { InspectorPanel } from './inspector/InspectorPanel';
import { SearchPanel } from './search/SearchPanel';
import { StatsPanel } from './stats/StatsPanel';

const TOOLS: readonly ToolId[] = ['stats', 'search', 'symbols'];

export function ToolPanel() {
  const t = useTranslate();
  const active = useStore(appStore, (state) => state.activeTool);

  const moveFocus = (delta: number): void => {
    const index = TOOLS.indexOf(active);
    const next = TOOLS[(index + delta + TOOLS.length) % TOOLS.length];
    if (next === undefined) return;
    setActiveTool(next);
    const element = document.getElementById(`textcount-tab-${next}`);
    element?.focus();
  };

  return (
    <aside class="pane pane--tools">
      <div class="tabs" role="tablist" aria-label={t('stats.detail')}>
        {TOOLS.map((tool) => {
          const selected = tool === active;
          return (
            <button
              key={tool}
              type="button"
              role="tab"
              id={`textcount-tab-${tool}`}
              class={selected ? 'tab tab--on' : 'tab'}
              aria-selected={selected}
              aria-controls={`textcount-panel-${tool}`}
              tabIndex={selected ? 0 : -1}
              onClick={() => setActiveTool(tool)}
              onKeyDown={(event) => {
                if (event.key === 'ArrowRight') {
                  event.preventDefault();
                  moveFocus(1);
                } else if (event.key === 'ArrowLeft') {
                  event.preventDefault();
                  moveFocus(-1);
                }
              }}
            >
              {t(`tool.${tool}`)}
            </button>
          );
        })}
      </div>

      <div
        class="panel"
        role="tabpanel"
        id={`textcount-panel-${active}`}
        aria-labelledby={`textcount-tab-${active}`}
        data-testid={`panel-${active}`}
      >
        {active === 'stats' ? <StatsPanel /> : null}
        {active === 'search' ? <SearchPanel /> : null}
        {active === 'symbols' ? <InspectorPanel /> : null}
      </div>
    </aside>
  );
}
