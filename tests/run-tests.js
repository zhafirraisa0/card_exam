import assert from 'node:assert/strict';
import { BindingService } from '../src/services/bindingService.js';
import { FolderService } from '../src/services/folderService.js';
import { PhotoService } from '../src/services/photoService.js';
import { createInitialState, StorageService } from '../src/services/storageService.js';
import { ExcelService } from '../src/services/excelService.js';
import { displayLevel, renderFoldersPage } from '../src/pages/foldersPage.js';
import { renderPhotosPage } from '../src/pages/photosPage.js';
import { printGridFits, getPrintSheetSize, getEffectivePrintLayout, renderPrintPage } from '../src/pages/printPage.js';
import { CardService } from '../src/services/cardService.js';
import { renderCardEditorWorkbench } from '../src/components/cardEditor.js';
import { renderDashboardPage } from '../src/pages/dashboardPage.js';
import { PdfService } from '../src/services/pdfService.js';
import { PrintAssetService } from '../src/services/printAssetService.js';
import { readFileSync } from 'node:fs';

// Test 1: Dynamic Excel variable generation & leading zero preservation
const mockExcelMeta = {
  fileId: 'xls_1',
  fileName: 'data_9a.xlsx',
  worksheet: 'Sheet1',
  columns: [
    { variableId: 'excel_col_001', originalHeader: 'Nama Peserta', columnIndex: 0 },
    { variableId: 'excel_col_002', originalHeader: 'NISN', columnIndex: 1 },
    { variableId: 'excel_col_003', originalHeader: 'Akun CBT', columnIndex: 2 },
    { variableId: 'excel_col_004', originalHeader: 'Sandi CBT', columnIndex: 3 }
  ]
};
const vars = BindingService.getAvailableVariables(mockExcelMeta);
assert.equal(vars.length, 4);
assert.equal(vars[1].token, '{{NISN}}');

const student = {
  studentId: 'stu_1',
  fields: {
    'Nama Peserta': 'Ahmad Fauzi',
    'NISN': '0012345678',
    'Akun CBT': 'ahmad01',
    'Sandi CBT': 'ujian123'
  }
};
const resolvedNisn = BindingService.resolveElementValue({ kind: 'dynamic', header: 'NISN' }, student, mockExcelMeta);
assert.equal(resolvedNisn, '0012345678', 'Leading zero pada NISN harus dipertahankan');

// Test 1b: Template variables auto-bind to the active Excel sheet and preserve manual choices.
const bindTemplate = { elements: [
  { id: 'name', kind: 'dynamic', header: '', label: 'Nama Siswa' },
  { id: 'id', kind: 'dynamic', header: '', label: 'Nomor Induk' },
  { id: 'user', kind: 'dynamic', header: '', label: 'Username CBT' },
  { id: 'pass', kind: 'dynamic', header: '', label: 'Password CBT' }
] };
assert.equal(BindingService.autoBindTemplate(bindTemplate, mockExcelMeta), 4);
assert.deepEqual(bindTemplate.elements.map(element => element.header), ['Nama Peserta', 'NISN', 'Akun CBT', 'Sandi CBT']);
const manualBinding = { elements: [{ kind: 'dynamic', header: 'NISN', label: 'Nama Siswa' }] };
BindingService.autoBindTemplate(manualBinding, mockExcelMeta);
assert.equal(manualBinding.elements[0].header, 'NISN', 'Binding manual yang valid harus dipertahankan');

// Test 2: Folder Isolation & Photo Matching
const state = createInitialState();
const fA = FolderService.createFolder(state, { level: 'KELAS IX', className: 'IX A' });
const fB = FolderService.createFolder(state, { level: 'KELAS IX', className: 'IX B' });
fA.excelMeta = mockExcelMeta;
fA.students = [student];
fA.photos = [{ photoId: 'pho_1', fileName: '0012345678.jpg', baseName: '0012345678', dataUrl: 'data:image/jpeg;base64,', matchedStudentId: null }];

const matchRes = PhotoService.autoMatchFolderPhotos(fA);
assert.equal(matchRes.matchedCount, 1);
assert.equal(fA.students[0].photoId, 'pho_1');
assert.equal(fB.students.length, 0, 'Folder kelas harus terisolasi');

const excelPhotoFolder = { excelMeta: { columns: [{ originalHeader: 'Nama' }, { originalHeader: 'Foto Siswa' }] },
  students: [{ studentId: 'stu_photo_ref', fields: { Nama: 'Siswa Referensi', 'Foto Siswa': 'foto/angkatan/ID-0098.JPG' }, photoId: null }],
  photos: [{ photoId: 'pho_ref', fileName: 'ID-0098.JPG', baseName: 'ID-0098', dataUrl: 'data:image/jpeg;base64,', matchedStudentId: null }] };
assert.equal(PhotoService.autoMatchFolderPhotos(excelPhotoFolder).matchedCount, 1, 'Referensi foto di kolom Excel harus dicocokkan ke basename file foto');
assert.equal(excelPhotoFolder.students[0].photoId, 'pho_ref');
assert.equal(BindingService.isPhotoHeader('Foto Siswa'), true);
assert.equal(BindingService.isPhotoHeader('Nama Lengkap'), false);
const photoFieldCard = CardService.renderCardHtml({ schoolProfile: {} }, { photos: [{ photoId: 'pho_path', fileName: 'foto-007.jpg', baseName: 'foto-007', dataUrl: 'data:image/jpeg;base64,PHOTO' }] }, { photoId: null, fields: { Foto: 'folder/foto-007.jpg' } }, { widthMm: 85.6, heightMm: 54, elements: [{ id: 'photo-from-column', kind: 'photo', header: 'Foto', x: 2, y: 2, w: 30, h: 40 }] });
assert.match(photoFieldCard, /src="data:image\/jpeg;base64,PHOTO"/, 'Elemen foto harus merender foto berdasarkan referensi kolom Excel');
const photoOnlyEditor = renderCardEditorWorkbench(createInitialState(), { excelMeta: { columns: [{ originalHeader: 'Nama' }] }, students: [], photos: [{ photoId: 'p1' }] }, { widthMm: 85.6, heightMm: 54, elements: [] }, { zoom: 1, selectedElementId: null, previewStudentIndex: 0, snapToGrid: false });
assert.match(photoOnlyEditor, /data-drag-var="Foto Siswa"/, 'Variabel sistem foto tersedia walau Excel tidak punya kolom foto');
assert.match(photoOnlyEditor, /Foto opsional/);

// Removing/replacing a manual photo link must not leave a stale match behind.
const secondPhoto = { photoId: 'pho_2', fileName: '0012345678-copy.jpg', baseName: '0012345678', dataUrl: 'data:image/jpeg;base64,', matchedStudentId: null };
fA.photos.push(secondPhoto);
assert.equal(PhotoService.autoMatchFolderPhotos(fA).matchedCount, 1, 'Satu siswa tidak boleh menerima lebih dari satu pencocokan otomatis');

// Test 3: CSV import works without an external XLSX CDN and handles quoted values.
const csvText = 'Nama Siswa;NISN;Keterangan\r\n"Dewi, Putri";001234;"Kelas 8; pagi"\r\nBudi;000056;Siang\r\n';
const csvParsed = ExcelService.parseWorkbookBuffer(new TextEncoder().encode(csvText).buffer, 'siswa.csv');
const csvData = ExcelService.extractSheetData(csvParsed, 'CSV', 1);
assert.equal(csvData.students.length, 2);
assert.equal(csvData.students[0].fields['Nama Siswa'], 'Dewi, Putri');
assert.equal(csvData.students[0].fields.NISN, '001234');
assert.equal(csvData.students[0].fields.Keterangan, 'Kelas 8; pagi');
assert.throws(() => ExcelService.extractSheetData(csvParsed, 'CSV', 8), /Judul kolom tidak ditemukan/);
const latinCsv = Uint8Array.from([78,97,109,97,59,75,111,116,97,10,74,111,115,233,59,66,97,110,100,117,110,103]).buffer;
assert.equal(ExcelService.extractSheetData(ExcelService.parseWorkbookBuffer(latinCsv, 'daftar.csv'), 'CSV').students[0].fields.Nama, 'José');

// Test 4: Grade cards are school-defined; room list is entered only after a level exists.
assert.equal(displayLevel('KELAS VIII'), 'Kelas 8');
assert.equal(displayLevel('Kelas IX'), 'Kelas 9');
const folderPage = renderFoldersPage(state);
assert.doesNotMatch(folderPage, /data-grade="Kelas 7"/);
assert.match(folderPage, /Tambah tingkat/);
assert.doesNotMatch(folderPage, /inp-dir-picker|Import Satu Folder/);
state.classLevels = ['Kelas 7', 'Kelas 10'];
assert.match(renderFoldersPage(state), /data-grade="Kelas 7"/);
assert.match(renderFoldersPage(state), /data-grade="Kelas 10"/);
assert.match(renderFoldersPage(state), /data-del-level="Kelas 10"/, 'Tingkatan punya aksi hapus tersendiri');
state.folderLevelView = 'Kelas 9';
assert.match(renderFoldersPage(state), /IX A/);
assert.match(renderFoldersPage(state), /IX B/);
assert.throws(() => FolderService.createFolder(state, { level: 'Kelas 9', className: 'IX A' }), /sudah terdaftar/);

const deleteLevelState = createInitialState();
deleteLevelState.classLevels = ['Kelas 8', 'Kelas 9', 'Kelas 7'];
const deleteEightA = FolderService.createFolder(deleteLevelState, { level: 'Kelas VIII', className: '8A' });
deleteEightA.students = [{ studentId: 'del-1', fields: { Nama: 'Siswa 8' } }];
deleteEightA.photos = [{ photoId: 'del-photo', dataUrl: 'data:image/jpeg;base64,' }];
FolderService.createFolder(deleteLevelState, { level: 'Kelas 8', className: '8B' });
FolderService.createFolder(deleteLevelState, { level: 'Kelas 9', className: '9A' });
const deletedLevel = FolderService.deleteLevel(deleteLevelState, 'Kelas 8');
assert.deepEqual(deletedLevel, { classCount: 2, studentCount: 1, photoCount: 1 });
assert.equal(deleteLevelState.folders.length, 1, 'Tingkat lain beserta rombelnya harus tetap ada');
assert.equal(deleteLevelState.folders[0].className, '9A');
assert.deepEqual(deleteLevelState.classLevels, ['Kelas 9', 'Kelas 7']);
assert.equal(deleteLevelState.activeFolderId, deleteLevelState.folders[0].folderId, 'Kelas aktif berpindah setelah tingkat dihapus');

// Test 5: Print sizing protects the physical card grid from paper overflow.
const printConfig = { paperSize: 'A4', orientation: 'portrait', customPaperW: 210, customPaperH: 297, marginMm: 10, gapMm: 1, cols: 2, rows: 5 };
assert.deepEqual(getPrintSheetSize(printConfig), { width: 210, height: 297 });
assert.equal(printGridFits(printConfig, { widthMm: 85.6, heightMm: 54 }), true);
assert.deepEqual(getPrintSheetSize({ ...printConfig, paperSize: 'F4' }), { width: 215, height: 330 });
assert.equal(printGridFits({ ...printConfig, autoCapacity: false, fitCards: false, rows: 6 }, { widthMm: 85.6, heightMm: 54 }), false);
assert.equal(printGridFits({ ...printConfig, autoCapacity: false, fitCards: false, cols: 1.5 }, { widthMm: 85.6, heightMm: 54 }), false);
const autoLayout = getEffectivePrintLayout({ ...printConfig, autoCapacity: true, cardW: 85.6, cardH: 54 }, { widthMm: 85.6, heightMm: 54 });
assert.deepEqual([autoLayout.cols, autoLayout.rows, autoLayout.capacity], [2, 5, 10]);
const fittedLayout = getEffectivePrintLayout({ ...printConfig, autoCapacity: false, fitCards: true, cols: 3, rows: 5 }, { widthMm: 85.6, heightMm: 54 });
assert.equal(fittedLayout.fits, true);
assert.ok(fittedLayout.cardW < 85.6, 'Ukuran kartu mengikuti kapasitas baris dan kolom yang dipilih');
const oldStorageData = createInitialState(); oldStorageData.printConfig.gapMm = 4;
globalThis.localStorage = { getItem: () => JSON.stringify(oldStorageData) };
const loadedPrintState = StorageService.load();
assert.equal(getEffectivePrintLayout(loadedPrintState.printConfig, loadedPrintState.templates[0]).rows, 4, 'Layout lama yang overflow mendapat kapasitas efektif yang muat');
delete globalThis.localStorage;

// Test 6: QR card fields use the selected Excel field and rendered values are HTML-escaped.
const qrState = createInitialState();
const qrFolder = { className: '8A', excelMeta: { columns: [{ originalHeader: 'NISN' }] }, photos: [] };
const qrCard = CardService.renderCardHtml(qrState, qrFolder, { fields: { NISN: '<script>' } }, { widthMm: 85.6, heightMm: 54, elements: [{ id: 'qr1', kind: 'qr', header: 'NISN', x: 2, y: 2, w: 30, h: 30 }] });
assert.match(qrCard, /data-qr-value="&lt;script&gt;"/);
assert.doesNotMatch(qrCard, /<script>/);

// Test 7: Print preview uses the active class template and renders edited design with imported values.
const printState = createInitialState();
printState.schoolProfile = { schoolName: 'SMP Contoh' };
printState.exams = [{ id: 'exam_print', name: 'Sumatif Akhir Semester', type: 'Ujian CBT', academicYear: '2026/2027', semester: 'Ganjil', examDate: '2026-11-30' }];
const printFolder = FolderService.createFolder(printState, { level: 'Kelas 8', className: '8A' });
printFolder.examId = 'exam_print';
printFolder.excelMeta = mockExcelMeta;
printFolder.students = [student];
printFolder.templateId = printState.activeTemplateId;
const printTemplate = printState.templates[0];
printTemplate.elements = [
  { id: 'edited-title', kind: 'static', text: 'KARTU UJIAN SEMESTER', x: 18, y: 12, w: 280, h: 20 },
  { id: 'exam-name', kind: 'dynamic', header: '@exam:name', label: 'Nama Kegiatan Ujian', x: 18, y: 34, w: 250, h: 18 },
  { id: 'edited-name', kind: 'dynamic', label: 'Nama Siswa', header: '', x: 96, y: 44, w: 210, h: 20 },
  { id: 'optional-photo', kind: 'photo', x: 18, y: 44, w: 66, h: 84 }
];
const oldDocument = globalThis.document;
globalThis.document = { getElementById: () => null, createElement: () => ({ style: {} }), head: { append() {} } };
const printHtml = renderPrintPage(printState);
assert.match(printHtml, /KARTU UJIAN SEMESTER/, 'Desain edit harus masuk ke pratinjau cetak');
assert.match(printHtml, /Sumatif Akhir Semester/, 'Kegiatan ujian yang ditautkan harus tersedia pada isi kartu');
assert.match(printHtml, /id="prt-exam"/, 'Kegiatan ujian dapat ditautkan langsung dari halaman cetak');
assert.match(printHtml, /Ahmad Fauzi/, 'Variabel siswa harus terisi otomatis di pratinjau');
assert.doesNotMatch(printHtml, /FOTO SISWA/, 'Foto tidak wajib dan placeholder tidak ikut tercetak');
assert.match(printHtml, /print-ready-card/, 'Kartu siap cetak diringkas di panel pengaturan');
assert.match(printHtml, /print-preview-column/, 'Pratinjau kertas berada di kolom tersendiri');
assert.match(printHtml, /id="prt-class"/, 'Kelas dapat dipilih langsung dari halaman cetak');
assert.match(printHtml, /id="prt-template"/, 'Desain tersimpan dapat dipilih dari halaman cetak');
assert.match(printHtml, /id="btn-delete-print-template"/, 'Desain tersimpan dapat dihapus dari halaman cetak');
assert.doesNotMatch(printHtml, /print-folder-photos/, 'Pengelolaan folder foto tetap ada di halaman Foto Siswa');
assert.match(printHtml, /Kapasitas otomatis/);
assert.match(printHtml, /Ekspor konfigurasi/);
assert.doesNotMatch(printHtml, /inp-excel-file|prt-qr-size|prt-show-cut-marks|prt-show-school-logo/);
assert.doesNotMatch(printHtml, /Data Excel \/ CSV|Ukuran QR Code|garis potong|Tampilkan logo sekolah/i);
assert.match(renderPhotosPage({ ...printState, activeFolderId: printFolder.folderId }), /webkitdirectory/, 'Foto Siswa menerima satu folder foto');
assert.match(renderPhotosPage({ ...printState, activeFolderId: printFolder.folderId }), /Disarankan/, 'Unggah folder foto ditandai sebagai pilihan utama');
assert.equal(printTemplate.elements.find(element => element.id === 'edited-name').header, 'Nama Peserta');
if (oldDocument === undefined) delete globalThis.document; else globalThis.document = oldDocument;

// Test 8: Dashboard avoids school-wide student/photo/print-ready totals.
const dashboardHtml = renderDashboardPage({ schoolProfile: { schoolName: 'SMP Contoh' }, folders: [printFolder], exams: [], devBypassAuth: true });
assert.doesNotMatch(dashboardHtml, /Total siswa|Foto cocok|Kartu siap cetak/i);
assert.match(dashboardHtml, /Tingkatan kelas/);
assert.doesNotMatch(dashboardHtml, /Daftar kelas/);

// Test 9: Clearing a class only removes its roster, Excel metadata, and photos.
const clearState = createInitialState();
const clearFolder = FolderService.createFolder(clearState, { level: 'Kelas 10', className: '10C' });
clearFolder.excelMeta = mockExcelMeta; clearFolder.students = [student]; clearFolder.photos = [{ photoId: 'p1', dataUrl: 'data:image/png;base64,AA==' }];
FolderService.clearFolderData(clearState, clearFolder.folderId);
assert.equal(clearFolder.students.length, 0);
assert.equal(clearFolder.photos.length, 0);
assert.equal(clearFolder.excelMeta, null);
assert.equal(clearState.folders.length, 1, 'Rombel tetap ada setelah data impor dibersihkan');

// Test 10: PDF text is emitted as vector text; the full card is never rasterized.
const calls = { text: [], images: 0, raster: 0, rect: [] };
class FakeJsPDF {
  constructor() { this.internal = { pageSize: { getWidth: () => 210, getHeight: () => 297 } }; }
  setFillColor() {} rect(...args) { calls.rect.push(args); } setDrawColor() {} setLineWidth() {} setFont() {} setFontSize() {} setTextColor() {}
  getTextWidth(value) { return String(value).length * 1.5; }
  text(value) { calls.text.push(value); }
  addImage() { calls.images++; } addPage() {} setLineDashPattern() {} save() {}
}
const previousDocument = globalThis.document; const previousWindow = globalThis.window;
globalThis.document = { getElementById: () => null, createElement: () => ({ style: {} }), head: { append() {} }, querySelectorAll(selector) { return selector.includes('generated-exam-card') ? [{ querySelectorAll: () => [] }] : []; }, fonts: null };
globalThis.window = { jspdf: { jsPDF: FakeJsPDF }, html2canvas: async () => { calls.raster++; } };
const vectorState = createInitialState();
 vectorState.printConfig = { ...vectorState.printConfig, autoCapacity: false, fitCards: false, cols: 1, rows: 1, marginMm: 5 };
const vectorFolder = { className: '10C', excelMeta: mockExcelMeta };
vectorFolder.examId = 'exam_print'; vectorState.exams = [{ id: 'exam_print', name: 'Ujian PDF', type: 'CBT', academicYear: '2026/2027', semester: 'Ganjil', examDate: '2026-11-30' }];
const vectorTemplate = { widthMm: 85.6, heightMm: 54, bgColor: '#ffffff', accentColor: '#123456', elements: [{ id: 'vtext', kind: 'static', text: 'KARTU TAJAM', x: 10, y: 10, w: 180, h: 20, fontSize: 12, fontWeight: '700' }, { id: 'examtext', kind: 'dynamic', header: '@exam:name', label: 'Nama Kegiatan Ujian', x: 10, y: 30, w: 180, h: 20, fontSize: 10 }] };
await PdfService.exportCardsPdf(vectorState, vectorFolder, [{ fields: {} }], vectorTemplate, getEffectivePrintLayout(vectorState.printConfig, vectorTemplate));
assert.ok(calls.text.includes('KARTU TAJAM'));
assert.ok(calls.text.includes('Ujian PDF'), 'Variabel kegiatan ujian ikut diekspor sebagai teks PDF yang tajam');
assert.equal(calls.raster, 0, 'Elemen teks template tidak boleh dirasterisasi');
assert.ok(Math.abs(calls.rect[0][0] - 62.2) < 0.01 && Math.abs(calls.rect[0][1] - 121.5) < 0.01, 'Kartu PDF harus dipusatkan di area kertas');
const printCss = readFileSync(new URL('../src/styles/main.css', import.meta.url), 'utf8');
const printPageSource = readFileSync(new URL('../src/pages/printPage.js', import.meta.url), 'utf8');
assert.match(printCss, /\.content-body>:not\(#print-output-area\)\{display:contents!important\}/, 'Pembungkus pratinjau tidak boleh disembunyikan saat cetak');
assert.match(printCss, /justify-content:center!important;align-content:center!important/, 'Kartu di halaman cetak harus berada di tengah kertas');
assert.match(printCss, /--print-width,210mm/, 'Cetak selalu menggunakan lebar fisik kertas A4 saat A4 dipilih');
assert.match(printPageSource, /printReadyAssetsOnCurrentPage/, 'Folder kartu dicetak melalui tombol utama pada halaman yang sama');
assert.doesNotMatch(printPageSource, /window\.open\(/, 'Membuka atau mencetak file siap cetak tidak boleh membuat tab baru');
assert.match(printPageSource, /print-action-button[^>]*><svg/, 'Tombol Cetak kartu memiliki ikon printer');
const readyState = createInitialState(); const readyFolder = FolderService.createFolder(readyState, { level: 'Kelas 7', className: '7A' });
readyFolder.printAssets = [{ id: 'pdf-ready-1', fileName: 'kartu-siap.pdf', mimeType: 'application/pdf', size: 2000 }];
assert.match(renderPrintPage(readyState), /prt-ready-folder/, 'Kelas tanpa Excel dapat mengunggah folder kartu siap cetak');
assert.match(renderPrintPage(readyState), /id="prt-rows"/, 'File kartu siap cetak dapat memakai pengaturan baris dan kolom');
assert.match(renderPrintPage(readyState), /print-empty-design/, 'Kelas kosong tetap memiliki alur memilih dan mengedit desain kartu');
assert.match(renderPrintPage(readyState), /data-goto="templates">Buka halaman edit kartu/, 'Halaman produksi mengarahkan kelas kosong ke editor desain');
assert.match(renderPrintPage(readyState), /print-ready-paper-grid/, 'Kelas kosong mendapat pratinjau kertas dengan pengaturan produksi yang sama');
assert.match(renderPrintPage(readyState), /Pengaturan kertas, margin, jarak, ukuran kartu, dan kapasitas sama untuk semua kelas/, 'Salinan pengaturan produksi dipakai bersama setiap kelas');
assert.match(renderPrintPage(readyState), /data-open-ready-file="pdf-ready-1"/, 'File kartu tersimpan dapat dibuka dan dicetak');
assert.match(renderPrintPage(readyState), /data-clear-ready-files/, 'File duplikat atau keliru dapat dibersihkan sekaligus');
assert.match(renderPrintPage(readyState), /data-deduplicate-ready-files/, 'Daftar file punya aksi penghapus duplikat');
assert.equal(PrintAssetService.isSupported({ name: 'kartu.pdf', type: 'application/pdf' }), true);
assert.equal(PrintAssetService.isSupported({ name: 'daftar.xlsx', type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), false);
readyFolder.printAssets.push({ id: 'image-ready-1', fileName: 'kartu-depan.png', mimeType: 'image/png', size: 5000 });
assert.match(renderPrintPage(readyState), /data-edit-ready-image="image-ready-1"/, 'Gambar kartu siap cetak dapat dijadikan latar desain yang bisa diedit');
readyFolder.students = [{ id: 'student-ready-1', fields: { Nama: 'Siswa' } }];
assert.match(renderPrintPage(readyState), /print-ready-assets-rail/, 'Kelas dengan Excel juga dapat memakai folder kartu siap cetak opsional');
if (previousDocument === undefined) delete globalThis.document; else globalThis.document = previousDocument;
if (previousWindow === undefined) delete globalThis.window; else globalThis.window = previousWindow;

console.log('SEMUA PENGUJIAN UNIT BERHASIL (PASS).');
