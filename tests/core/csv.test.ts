import { describe, expect, it } from 'vitest';
import { parseCsv, toCsv } from '@/core/export/csv';

describe('Excel için CSV', () => {
  it('UTF-8 BOM, noktalı virgül ayraç ve CRLF satır sonu (Türkçe Excel doğrudan açar)', () => {
    expect(toCsv(['Ad', 'İl'], [['Örnek Gıda', 'İstanbul']])).toBe('\uFEFFAd;İl\r\nÖrnek Gıda;İstanbul\r\n');
  });

  it('ayraç, tırnak ve satır sonu içeren hücre tırnaklanır', () => {
    expect(toCsv(['A'], [['x;y'], ['"tırnak"'], ['iki\nsatır']])).toBe('\uFEFFA\r\n"x;y"\r\n"""tırnak"""\r\n"iki\nsatır"\r\n');
  });

  it('formül gibi başlayan metin etkisizleştirilir (CSV enjeksiyonu)', () => {
    expect(toCsv(['A'], [['=HYPERLINK("x")'], ['+90 555'], ['@SUM(A1)'], ['-5 indirim']])).toBe("\uFEFFA\r\n\"'=HYPERLINK(\"\"x\"\")\"\r\n'+90 555\r\n'@SUM(A1)\r\n'-5 indirim\r\n");
  });

  it('sayılar olduğu gibi, boş değerler boş hücre', () => {
    expect(toCsv(['A', 'B', 'C'], [[1234, null, -5]])).toBe('\uFEFFA;B;C\r\n1234;;-5\r\n');
  });
});

describe('CSV okuma', () => {
  it('BOM, ";" veya "," ayraç, tırnaklı hücre ve satır sonu', () => {
    expect(parseCsv('\uFEFFAd;İl\r\n"Örnek; Gıda";İstanbul\r\n"Tırnak ""içi""";\r\n')).toEqual([['Ad', 'İl'], ['Örnek; Gıda', 'İstanbul'], ['Tırnak "içi"', '']]);
    expect(parseCsv('Ad,İl\n"A, B",Antalya\n')).toEqual([['Ad', 'İl'], ['A, B', 'Antalya']]);
    expect(parseCsv('Ad;Not\n"iki\nsatır";x\n')).toEqual([['Ad', 'Not'], ['iki\nsatır', 'x']]);
  });

  it('boş satırlar atlanır; bizim eklediğimiz formül önleme işareti geri alınır', () => {
    expect(parseCsv('Ad\n\n\'=1+1\n')).toEqual([['Ad'], ['=1+1']]);
  });

  it('dışa aktardığımız CSV aynen geri okunur', () => {
    const rows = [['Örnek; "Gıda"', '-5 indirim', 'iki\nsatır']];
    expect(parseCsv(toCsv(['A', 'B', 'C'], rows))).toEqual([['A', 'B', 'C'], ...rows]);
  });
});
