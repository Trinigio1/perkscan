import { parseRecalls } from '../cpsc';

describe('parseRecalls', () => {
  it('keeps what matching needs, with the remedy in a word', () => {
    const rows = parseRecalls([
      {
        RecallID: 10123,
        RecallNumber: '27-012',
        RecallDate: '2026-10-20T00:00:00',
        Title: 'Acme Recalls  Space Heaters Due to Fire Hazard',
        URL: 'https://www.cpsc.gov/Recalls/2027/acme-recalls-space-heaters',
        Products: [{ Name: 'Acme Ceramic Space Heater', Model: 'SH-2200, SH-2210', Type: 'Heater' }],
        Manufacturers: [{ Name: 'Acme Corp', CompanyID: '1' }],
        RemedyOptions: [{ Option: 'Refund' }],
        Remedies: [{ Name: 'Consumers should stop using the heaters and contact Acme for a full refund.' }],
      },
      { RecallID: 2, RecallDate: '2026-10-01', Title: 'No link', URL: 'http://insecure.example.com' },
      { RecallDate: '2026-10-01', Title: 'No id', URL: 'https://www.cpsc.gov/x' },
      'junk',
      { RecallID: 3, RecallDate: '2026-09-30T00:00:00', Title: 'Bike Recall', URL: 'https://www.cpsc.gov/Recalls/2026/bike', Products: [{ Name: 'Kids bike', Model: '' }], Remedies: [{ Name: 'Free repair or replacement.' }] },
    ]);
    expect(rows).toEqual([
      { id: '10123', recall_number: '27-012', recall_date: '2026-10-20', title: 'Acme Recalls Space Heaters Due to Fire Hazard', url: 'https://www.cpsc.gov/Recalls/2027/acme-recalls-space-heaters', products: [{ name: 'Acme Ceramic Space Heater', model: 'SH-2200, SH-2210' }], manufacturers: ['Acme Corp'], remedies: ['Refund'] },
      { id: '3', recall_number: null, recall_date: '2026-09-30', title: 'Bike Recall', url: 'https://www.cpsc.gov/Recalls/2026/bike', products: [{ name: 'Kids bike', model: null }], manufacturers: [], remedies: ['Replace', 'Repair'] },
    ]);
  });
  it('treats anything but a list as nothing', () => {
    expect(parseRecalls({ error: 'x' })).toEqual([]);
  });
});
