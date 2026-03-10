import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { GameNode } from '../../types/game';
import { theme } from '../../styles/theme';

interface PopupEvent {
  id: string;
  node: GameNode;
  timestamp: number;
}

interface MultiplierPopupProps {
  activatedNodeIds: Set<string>;
  nodes: GameNode[];
}

export function MultiplierPopup({ activatedNodeIds, nodes }: MultiplierPopupProps) {
  const [events, setEvents] = useState<PopupEvent[]>([]);

  useEffect(() => {
    const newEvents: PopupEvent[] = [];
    for (const node of nodes) {
      if (activatedNodeIds.has(node.id) && !events.find(e => e.id === node.id)) {
        newEvents.push({ id: node.id, node, timestamp: Date.now() });
      }
    }
    if (newEvents.length > 0) {
      setEvents(prev => [...prev, ...newEvents].slice(-5));
    }
  }, [activatedNodeIds, nodes]);

  // Clean up old events
  useEffect(() => {
    const interval = setInterval(() => {
      setEvents(prev => prev.filter(e => Date.now() - e.timestamp < 2000));
    }, 500);
    return () => clearInterval(interval);
  }, []);

  return (
    <div style={styles.container}>
      <AnimatePresence>
        {events.map((event) => {
          const { node } = event;
          const isMultiplier = node.type === 'multiplier';
          const isDivider = node.type === 'divider';
          const isShield = node.type === 'shield';

          const color = isMultiplier ? theme.game.multiplier :
                        isDivider ? theme.game.divider :
                        theme.game.shield;

          const label = isMultiplier ? `+x${node.value}` :
                        isDivider ? `-÷${node.value}` :
                        isShield ? '+Shield' : '';

          return (
            <motion.div
              key={event.id}
              initial={{ opacity: 0, y: 20, scale: 0.5 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -40, scale: 0.8 }}
              transition={{ duration: 0.4, ease: 'easeOut' }}
              style={{
                ...styles.popup,
                color,
              }}
            >
              {label}
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '4px',
    pointerEvents: 'none',
    zIndex: 5,
  },
  popup: {
    fontFamily: "'Orbitron', sans-serif",
    fontSize: '30px',
    fontWeight: 800,
    textShadow: '0 0 12px currentColor',
  },
};
