import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import AddSession from '../AddSession';

const navigateMock = vi.fn();

vi.mock('react-router-dom', () => ({
  useNavigate: () => navigateMock
}));

describe('route/AddSession', () => {
  beforeEach(() => {
    navigateMock.mockReset();
  });
  afterEach(() => {
    cleanup();
  });

  it('affiche une erreur de validation et bloque la soumission', () => {
    const onAddSession = vi.fn();
    render(<AddSession onAddSession={onAddSession} />);
    fireEvent.click(screen.getByRole('button', { name: 'Valider la date' }));
    fireEvent.click(screen.getByRole('button', { name: 'Valider le type' }));
    fireEvent.change(screen.getByLabelText('Distance (km)'), { target: { value: '8' } });
    fireEvent.change(screen.getByLabelText('Durée (heures)'), { target: { value: '0' } });
    fireEvent.change(screen.getByLabelText('Durée (minutes)'), { target: { value: '0' } });
    fireEvent.change(screen.getByLabelText('Durée (secondes)'), { target: { value: '0' } });

    const submitButton = screen.getByRole('button', { name: 'Valider la séance' });
    const form = submitButton.closest('form');
    expect(form).not.toBeNull();
    fireEvent.submit(form!);

    expect(screen.getByText('La durée doit être supérieure à 0.')).toBeInTheDocument();
    expect(onAddSession).not.toHaveBeenCalled();
    expect(navigateMock).not.toHaveBeenCalled();
  });

  it('soumet, crée la séance et redirige vers /sessions', () => {
    const onAddSession = vi.fn();
    render(<AddSession onAddSession={onAddSession} />);
    fireEvent.click(screen.getByRole('button', { name: 'Valider la date' }));
    fireEvent.click(screen.getByRole('button', { name: 'Valider le type' }));

    fireEvent.change(screen.getByLabelText('Distance (km)'), {
      target: { value: '10.2' }
    });
    fireEvent.change(screen.getByLabelText('Durée (heures)'), { target: { value: '0' } });
    fireEvent.change(screen.getByLabelText('Durée (minutes)'), { target: { value: '50' } });
    fireEvent.change(screen.getByLabelText('Durée (secondes)'), { target: { value: '0' } });
    fireEvent.change(screen.getByLabelText('RPE'), { target: { value: '6' } });

    fireEvent.click(screen.getByRole('button', { name: 'Valider la séance' }));

    expect(onAddSession).toHaveBeenCalledTimes(1);
    const session = onAddSession.mock.calls[0][0];
    expect(session.sportType).toBe('RUNNING');
    expect(session.durationMin).toBe(50);
    expect(session.distanceKm).toBe(10.2);
    expect(session.xp).toBeGreaterThanOrEqual(20);
    expect(navigateMock).toHaveBeenCalledWith('/sessions');
  });

  it('permet de paramétrer des intervalles et d’appliquer les totaux auto', () => {
    const onAddSession = vi.fn();
    render(<AddSession onAddSession={onAddSession} />);

    fireEvent.click(screen.getByRole('button', { name: 'Valider la date' }));
    fireEvent.click(screen.getByRole('button', { name: 'Choisir un autre type' }));
    fireEvent.click(screen.getByRole('radio', { name: /Fractionné court/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Valider le type' }));

    fireEvent.change(screen.getByLabelText('Répétitions'), { target: { value: '10' } });
    fireEvent.change(screen.getByLabelText('Travail'), { target: { value: '200' } });
    fireEvent.change(screen.getByLabelText('Unité travail'), { target: { value: 'M' } });
    fireEvent.change(screen.getByLabelText('Récupération'), { target: { value: '30' } });
    fireEvent.change(screen.getByLabelText('Unité récup'), { target: { value: 'SEC' } });
    fireEvent.click(screen.getByRole('button', { name: 'Appliquer les totaux aux champs' }));
    fireEvent.click(screen.getByRole('button', { name: 'Valider les intervalles' }));
    fireEvent.click(screen.getByRole('button', { name: 'Valider la séance' }));

    expect(onAddSession).toHaveBeenCalledTimes(1);
    const session = onAddSession.mock.calls[0][0];
    expect(session.durationMin).toBeCloseTo(5, 2);
    expect(session.distanceKm).toBeCloseTo(2, 2);
    expect(session.comment).toContain('Intervalles:');
    expect(navigateMock).toHaveBeenCalledWith('/sessions');
  });
});
