import { describe, expect, it } from 'vitest';
import { construirCorreo, cuerpoAHtml, urlSegura } from './plantillaCorreo';

describe('plantilla de correo masivo', () => {
  it('el texto del cliente se escapa (no se cuela HTML ni scripts)', () => {
    const html = construirCorreo({ titulo: '<script>alert(1)</script>', cuerpo: 'Hola <b onclick="x()">tú</b> & fin' });
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('&lt;b onclick=&quot;x()&quot;&gt;');
    expect(html).toContain('&amp; fin');
  });

  it('párrafos, saltos de línea y **negrita**; {{nombre}} se conserva para que el servidor lo reemplace', () => {
    const h = cuerpoAHtml('Hola {{nombre}}\nsegunda línea\n\nUn **gran** aviso');
    expect(h.match(/<p /g)).toHaveLength(2);
    expect(h).toContain('{{nombre}}<br>segunda línea');
    expect(h).toContain('<b>gran</b>');
  });

  it('solo se aceptan links http(s) y mailto: nada de javascript:', () => {
    expect(urlSegura('javascript:alert(1)')).toBe('');
    expect(urlSegura('data:text/html;base64,AAAA')).toBe('');
    expect(urlSegura(' https://tickets.com.ec/x ')).toBe('https://tickets.com.ec/x');
    expect(urlSegura('mailto:a@b.com')).toBe('mailto:a@b.com');
    const h = construirCorreo({ botonActivo: true, botonTexto: 'Comprar', botonLink: 'javascript:alert(1)', imagen: 'javascript:x', imagenLink: 'data:x' });
    expect(h).not.toContain('javascript:');
    expect(h).not.toContain('Comprar');        // sin link válido no hay botón
    expect(h).not.toContain('<img');
  });

  it('con imagen, título y botón válidos sale cada parte', () => {
    const h = construirCorreo({ imagen: 'https://x.com/a.jpg', imagenLink: 'https://tickets.com.ec', titulo: 'Gran noche', botonActivo: true, botonTexto: 'Comprar entradas', botonLink: 'https://tickets.com.ec/evento', pie: 'Pie' });
    expect(h).toContain('<img src="https://x.com/a.jpg"');
    expect(h).toContain('<a href="https://tickets.com.ec" target="_blank">');
    expect(h).toContain('Gran noche');
    expect(h).toContain('>Comprar entradas</a>');
    expect(h).toContain('Pie');
  });

  it('un color inválido vuelve al de siempre (no entra CSS ajeno)', () => {
    const h = construirCorreo({ colorTitulo: 'red;background:url(x)', titulo: 'T', fondo: 'javascript:1' });
    expect(h).not.toContain('url(x)');
    expect(h).toContain('#1f2d4d');
    expect(h).toContain('#f2f4f7');
  });
});
