import { act, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import TokConnectMcpWidget from '@/pages/tok-connect/TokConnectMcpWidget';
import { getSupabase } from '@/integrations/supabase/client';

vi.mock('@/integrations/supabase/client', () => ({ getSupabase: vi.fn(() => { throw new Error('Live client must not be used'); }) }));

afterEach(() => {
  window.history.replaceState({}, '', '/');
  vi.clearAllMocks();
});

describe('aperçu TOK Connect explicitement isolé', () => {
  it('affiche les données fictives sans initialiser Supabase, même pour une fiche restaurant', async () => {
    window.history.replaceState({}, '', '/tok-connect/mcp-widget?mode=sandbox');
    render(<TokConnectMcpWidget />);
    expect(await screen.findByText('Données de démonstration')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Aucune réservation, commande ni paiement exécuté');
    expect(getSupabase).not.toHaveBeenCalled();
    const frame = screen.getByTitle('Module TOK Connect') as HTMLIFrameElement;
    const channel = /var channel = "([0-9a-f-]+)"/.exec(frame.srcdoc)?.[1];
    expect(channel).toBeTruthy();
    await act(async () => {
      window.dispatchEvent(new MessageEvent('message', {
        source: frame.contentWindow,
        origin: 'null',
        data: { type: 'tok_preview_call', channel, id: 'test-detail', name: 'get_restaurant_details', args: { restaurant_id: 'sandbox-test' } },
      }));
    });
    await waitFor(() => expect(screen.getByText('get_restaurant_details · sandbox-test')).toBeInTheDocument());
    expect(getSupabase).not.toHaveBeenCalled();
    const reply = vi.spyOn(frame.contentWindow!, 'postMessage');
    await act(async () => {
      window.dispatchEvent(new MessageEvent('message', {
        source: frame.contentWindow,
        origin: 'null',
        data: { type: 'tok_preview_call', channel, id: 'blocked-booking', name: 'tok_book_table', args: {} },
      }));
    });
    expect(reply).toHaveBeenCalledWith(expect.objectContaining({
      type: 'tok_preview_result', id: 'blocked-booking', error: expect.stringContaining('aucune transaction'),
    }), '*');
    expect(getSupabase).not.toHaveBeenCalled();
  });
});
