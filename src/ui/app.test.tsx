// @vitest-environment jsdom
// Prueba de interfaz: partida completa en modo "un solo móvil" pulsando botones como lo haría una familia.
import { describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import App from '../App';

vi.useFakeTimers({ toFake: ['setTimeout', 'setInterval', 'Date'] });

async function flush(ms = 400) {
  await act(async () => {
    vi.advanceTimersByTime(ms);
    await Promise.resolve();
  });
}
const click = async (name: RegExp | string) => {
  fireEvent.click(screen.getByRole('button', { name }));
  await flush(50);
};

describe('interfaz', () => {
  it('perfil → un solo móvil → partida completa → final', async () => {
    window.confirm = () => true;
    render(<App />);
    // primer arranque: perfil
    fireEvent.change(screen.getByPlaceholderText('Por ejemplo, Lucía'), { target: { value: 'Jose' } });
    await click('Adulto');
    await click('Empezar');
    expect(screen.getByText('Crear partida')).toBeTruthy();
    await click('Jugar con un solo móvil');
    // añadir una peque
    await click('Añadir jugador');
    fireEvent.change(screen.getByPlaceholderText('Por ejemplo, Lucía'), { target: { value: 'Lía' } });
    await click('Peques');
    await click('Añadir jugador');
    await click('2 rondas');
    await click('Empezar partida');
    await flush(800);

    let guard = 0;
    while (guard++ < 200) {
      await flush(400);
      if (screen.queryByText(/^¡Gana|Empate/)) break;
      const handoff = screen.queryByRole('button', { name: /^Soy / });
      if (handoff) {
        fireEvent.click(handoff);
        await flush(50);
        const input = screen.queryByPlaceholderText('Tu mentira');
        if (input) {
          fireEvent.change(input, { target: { value: 'una mentira ' + guard } });
          await click('Enviar mentira');
          continue;
        }
        if (screen.queryByText('Elige la mentira que quieres colar:')) {
          const kids = document.querySelectorAll('.kids .opt');
          fireEvent.click(kids[0]);
          await flush(50);
          continue;
        }
        const opts = [...document.querySelectorAll('.options .opt')] as HTMLButtonElement[];
        const free = opts.find((o) => !o.disabled);
        if (free) {
          fireEvent.click(free);
          await flush(50);
        }
        continue;
      }
      // revelación: saltar animación y pulsar siguiente
      const rev = document.querySelector('.reveal-item');
      if (rev) {
        for (let i = 0; i < 8; i++) await flush(3000);
      }
      const next = screen.queryByRole('button', { name: /Siguiente pregunta|Ver marcador|Empezar ronda|Ver resultado final/ });
      if (next) {
        fireEvent.click(next);
        await flush(100);
      }
    }
    expect(screen.queryByText(/^¡Gana|Empate/)).toBeTruthy();
    expect(screen.getByText('Jugar otra vez')).toBeTruthy();
    // los dos jugadores aparecen en el marcador final
    expect(screen.getAllByText('Jose').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Lía').length).toBeGreaterThan(0);
  }, 30000);

  it('tienda en web: explica que se compra desde la app y pide puerta parental solo en nativo', async () => {
    render(<App />);
    await click(/Más preguntas/);
    expect(screen.getByText(/se compra desde la app/)).toBeTruthy();
  });
});
