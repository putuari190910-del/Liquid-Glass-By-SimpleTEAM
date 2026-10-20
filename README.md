# LiquidGlass

LiquidGlass adalah pustaka JavaScript independen yang menerapkan efek kaca (glassmorphism) tingkat lanjut pada elemen DOM. Pustaka edisi "Lite" ini mengintegrasikan properti CSS khusus dengan filter SVG secara dinamis untuk menghasilkan manipulasi visual seperti pembiasan cahaya.

## Fitur Utama

* **Refraksi Dinamis:** Menghasilkan efek pembiasan cahaya (refraction) menggunakan pemetaan SVG (`feDisplacementMap` dan `feGaussianBlur`).
* **Solid Tint:** Mendukung pewarnaan latar belakang kaca secara presisi menggunakan format nilai HEX dan lapisan transparansi (alpha).
* **Edge Styling:** Memungkinkan konfigurasi ketebalan dan pencahayaan di bagian tepi elemen (atas, bawah, kiri, kanan) untuk simulasi dimensi fisik.
* **Responsif Otomatis:** Menggunakan `ResizeObserver` untuk mendeteksi perubahan dimensi elemen secara real-time dan memperbarui efek tanpa intervensi manual.

## Panduan Integrasi

Pustaka ini menggunakan format Universal Module Definition (UMD), sehingga kompatibel dengan sistem modul standar maupun dieksekusi langsung secara global di browser. 

Contoh penggunaan dasar:

```javascript
// Inisialisasi pada elemen dengan pemilih CSS
const glassEffect = new LiquidGlass('.elemen-target', {
    glassColorHex: '#ffffff',
    glassColorAlpha: 0.1,
    renderScale: 1,
    refraction: {
        amount: 100,
        radius: 15
    },
    edge: {
        width: 1,
        opacity: 0.6
    }
});
