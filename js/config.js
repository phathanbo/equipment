// Firebase Configuration & Field Definitions

export const firebaseConfig = {
    apiKey: "AIzaSyDbF85T09sAJzUGQdEuIYQ2_U8TISY4wa0",
    authDomain: "equipmentphayuha-e3f3f.firebaseapp.com",
    projectId: "equipmentphayuha-e3f3f",
    storageBucket: "equipmentphayuha-e3f3f.firebasestorage.app",
    messagingSenderId: "494382324661",
    appId: "1:494382324661:web:e876106fc5852acf4bd7fc",
    measurementId: "G-LBX4QLTBQJ"
};

export const defaultFields = [
    { key: 'noid', label: 'Noid', type: 'text', description: 'รหัสครุภัณฑ์หลักของโรงพยาบาล', required: false },
    { key: 'name', label: 'NAME', type: 'text', description: 'ชื่อเรียกของครุภัณฑ์', required: true },
    {
        key: 'div',
        label: 'Div (แผนก)',
        type: 'combo',
        options: [
            'ซ่อมเครื่องมือทั่วไป',
            'ศูนย์เครื่องมือแพทย์',
            'ไม่ระบุแผนก',
            'กลุ่มงานบริหารทั่วไป',
            'กลุ่มงานทันตกรรม',
            'กลุ่มงานรังสี',
            'กลุ่มงานเภสัชกรรมและคุ้มครองผู้บริโภค',
            'กลุ่มงานเทคนิคการแพทย์',
            'กลุ่มงานการพยาบาล',
            'งานการพยาบาลผู้ป่วยนอก (OPD)',
            'งานการพยาบาลผู้ป่วยใน (IPD)',
            'งานการพยาบาลผู้ป่วยคลอด',
            'งานการผู้ป่วยอุบัติเหตุฉุกเฉินและนิติเวช (ER)',
            'งานการพยาบาลหน่วยควบคุมการติดเชื้อและงานจ่ายกลาง',
            'กลุ่มงานบริการด้านปฐมภูมิและองค์รวม',
            'กลุ่มงานจิตเวชและยาเสพติด',
            'กลุ่มงานประกันสุขภาพยุทธศาสตร์',
            'กลุ่มงานดิจิทัล',
            'งานการเงินและบัญชี',
            'กลุ่มงานโภชนศาสตร์',
            'แผนกการแพทย์แผนไทย',
            'กลุ่มงานเวชศาสตร์ฟื้นฟู'
        ],
        description: 'หน่วยงานหรือแผนกที่ครอบครอง (เลือกหรือพิมพ์เอง)',
        required: true
    },
    {
        key: 'type',
        label: 'TYPE (ประเภทครุภัณฑ์)',
        type: 'combo',
        options: [
            'ครุภัณฑ์การแพทย์',
            'ครุภัณฑ์ยานพาหนะ',
            'ครุภัณฑ์การศึกษา',
            'ครุภัณฑ์ไฟฟ้าและวิทยุ',
            'ครุภัณฑ์โรงงาน',
            'ครุภัณฑ์คอมพิวเตอร์',
            'ครุภัณฑ์การเกษตร',
            'ครุภัณฑ์วิทยาศาสตร์',
            'ครุภัณฑ์งานบ้านงานครัว',
            'ครุภัณฑ์สำนักงาน',
            'ครุภัณฑ์โฆษณาและเผยแพร่',
            'ครุภัณฑ์อื่นๆ'
        ],
        description: 'ประเภทครุภัณฑ์ (เลือกหรือพิมพ์เอง)',
        required: true
    },
    { key: 'location', label: 'สถานที่จัดเก็บอุปกรณ์', type: 'text', description: 'ห้อง/จุด/สถานที่จัดเก็บอุปกรณ์', required: false },
    { key: 'perUnit', label: 'PERUNIT (ราคา/หน่วย)', type: 'number', description: 'ราคาจัดซื้อต่อหน่วย (บาท)', required: true },
    { key: 'receiveTm', label: 'วัน/เดือน/ปี (ที่ได้รับ)', type: 'text', description: 'พิมพ์เลขติดกันได้ เช่น 122567 หรือ 2122557 จะแปลงเป็น วว/ดด/ปปปป ให้อัตโนมัติ', required: false },
    { key: 'model', label: 'Model', type: 'text', description: 'รุ่น / โมเดลของอุปกรณ์', required: false },
    { key: 'serialNo', label: 'SERIAL NO', type: 'text', description: 'หมายเลขเครื่อง (S/N)', required: false },
    { key: 'company', label: 'COMPANY', type: 'text', description: 'บริษัทผู้จำหน่ายหรือผู้ดูแล', required: false },
    {
        key: 'tmoney',
        label: 'TMONEY (วิธีการได้มา)',
        type: 'combo',
        options: [
            'ของแถม',
            'ช่างรพ.ทำเอง',
            'ตกลงราคา',
            'บริจาค',
            'ประกวดราคา',
            'ประมูลอิเล็กทรอนิกส์',
            'ไม่ระบุ',
            'ยืม',
            'สอบราคา'
        ],
        description: 'วิธีการได้มา (เลือกหรือพิมพ์เอง)',
        required: false
    },
    {
        key: 'kmoney',
        label: 'KMONEY (งบประมาณ)',
        type: 'combo',
        options: [
            'โครงการเงินกู้',
            'งบบำรุง',
            'งบประมาณ',
            'เงินบริจาค',
            'เงินประกันสังคม',
            'เงินสวัสดิการ',
            'มาพร้อม CT',
            'รับบริจาค'
        ],
        description: 'ประเภทเงินงบประมาณ (เลือกหรือพิมพ์เอง)',
        required: false
    },
    {
        key: 'kind',
        label: 'KIND (ประเภทเครื่องมือ)',
        type: 'combo',
        options: [
            'เครื่องมือช่วยชีวิต',
            'เครื่องมือช่วยวินิจฉัย',
            'เครื่องมือเพื่อการรักษา',
            'เครื่องมือสนับสนุน'
        ],
        description: 'ประเภทเครื่องมือ (เลือกหรือพิมพ์เอง)',
        required: false
    },
    {
        key: 'risk',
        label: 'Risk (ระดับความเสี่ยง)',
        type: 'combo',
        options: [
            '1',
            '2',
            '3'
        ],
        description: 'ระดับความเสี่ยง 1-3 (เลือกหรือพิมพ์เอง)',
        required: false
    },
    { key: 'remark', label: 'หมายเหตุ (สถานะ)', type: 'combo', options: ['พร้อมใช้', 'ไม่พร้อมใช้', 'จำหน่ายแล้ว'], description: 'สถานะความพร้อมใช้งานปัจจุบัน (เลือกหรือพิมพ์เอง)', required: false },
    { key: 'newDate', label: 'New Date', type: 'number', description: 'ปีหรือรอบการลงทะเบียน', required: false },
    { key: 'pasaduId', label: 'Pasadu ID', type: 'text', description: 'เลข RMC เดิม', required: false }
];

export const isFirebaseConfigured = firebaseConfig.apiKey !== "YOUR_API_KEY" && !firebaseConfig.projectId.includes("YOUR_PROJECT_ID");
