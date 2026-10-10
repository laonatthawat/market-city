import type { SectorId } from '../engine/types';

export interface SectorMeta {
  id: SectorId;
  nameTh: string;
  districtTh: string;
  color: string; // pastel family base
  ground: string; // district plot color
  /** Generic industries used for disguised descriptions & simulated companies. */
  industriesTh: string[];
  /** Name fragments for disguised / simulated company names. */
  suffixes: string[];
}

export const SECTORS: Record<SectorId, SectorMeta> = {
  tech: {
    id: 'tech',
    nameTh: 'เทคโนโลยี',
    districtTh: 'ย่านเทคโนโลยี',
    color: '#b9a8ec',
    ground: '#e4dcf7',
    industriesTh: [
      'บริษัทซอฟต์แวร์องค์กรขนาดใหญ่',
      'ผู้ผลิตชิปและเซมิคอนดักเตอร์',
      'แพลตฟอร์มอินเทอร์เน็ตและโฆษณาออนไลน์',
      'ผู้ผลิตอุปกรณ์อิเล็กทรอนิกส์และฮาร์ดแวร์',
      'ผู้ให้บริการคลาวด์และระบบเครือข่าย',
      'บริษัทสื่อดิจิทัลและสตรีมมิง',
    ],
    suffixes: ['Systems', 'Labs', 'Digital', 'Micro', 'Networks', 'Logic'],
  },
  finance: {
    id: 'finance',
    nameTh: 'การเงิน',
    districtTh: 'ย่านการเงิน',
    color: '#8fd6b8',
    ground: '#d8f1e6',
    industriesTh: [
      'ธนาคารพาณิชย์ขนาดใหญ่',
      'ธนาคารระดับภูมิภาค',
      'บริษัทหลักทรัพย์และวาณิชธนกิจ',
      'เครือข่ายชำระเงินและบัตร',
      'บริษัทจัดการกองทุน',
      'บริษัทโฮลดิ้งและประกันภัย',
    ],
    suffixes: ['Capital', 'Bancorp', 'Financial', 'Trust', 'Holdings', 'Pay'],
  },
  energy: {
    id: 'energy',
    nameTh: 'พลังงาน',
    districtTh: 'ย่านพลังงาน',
    color: '#f4cf7e',
    ground: '#f9ebc8',
    industriesTh: [
      'บริษัทน้ำมันและก๊าซครบวงจร',
      'บริษัทสำรวจและผลิตปิโตรเลียม',
      'ผู้ให้บริการแท่นขุดเจาะและบริการน้ำมัน',
      'โรงกลั่นน้ำมัน',
      'ท่อส่งก๊าซและโครงสร้างพื้นฐานพลังงาน',
      'สาธารณูปโภคไฟฟ้า',
    ],
    suffixes: ['Energy', 'Petroleum', 'Power', 'Resources', 'Fuels', 'Grid'],
  },
  consumer: {
    id: 'consumer',
    nameTh: 'สินค้าอุปโภคบริโภค',
    districtTh: 'ย่านการค้า',
    color: '#f4adc3',
    ground: '#fadfe8',
    industriesTh: [
      'ห้างค้าปลีกขนาดใหญ่',
      'อีคอมเมิร์ซและค้าปลีกออนไลน์',
      'ผู้ผลิตเครื่องดื่มและอาหาร',
      'แบรนด์เครื่องแต่งกายและกีฬา',
      'เครือร้านอาหาร',
      'ผู้ผลิตรถยนต์',
      'บริษัทบันเทิงและท่องเที่ยว',
    ],
    suffixes: ['Brands', 'Goods', 'Retail', 'Foods', 'Market', 'Co'],
  },
  healthcare: {
    id: 'healthcare',
    nameTh: 'สุขภาพ',
    districtTh: 'ย่านการแพทย์',
    color: '#9fcdf0',
    ground: '#dcecf9',
    industriesTh: [
      'บริษัทยาขนาดใหญ่',
      'บริษัทเทคโนโลยีชีวภาพ',
      'ผู้ผลิตอุปกรณ์การแพทย์',
      'บริษัทประกันสุขภาพ',
      'ผู้ให้บริการเครื่องมือวิทยาศาสตร์',
    ],
    suffixes: ['Health', 'Pharma', 'Bio', 'Medical', 'Therapeutics', 'Care'],
  },
  industrial: {
    id: 'industrial',
    nameTh: 'อุตสาหกรรม',
    districtTh: 'ย่านอุตสาหกรรม',
    color: '#d8c19c',
    ground: '#eee3d1',
    industriesTh: [
      'ผู้ผลิตเครื่องจักรกลหนัก',
      'ผู้ผลิตอากาศยานและกลาโหม',
      'บริษัทขนส่งและโลจิสติกส์',
      'สายการบิน',
      'กลุ่มบริษัทอุตสาหกรรมหลากหลาย',
      'ระบบรางและขนส่งสินค้า',
    ],
    suffixes: ['Industries', 'Aero', 'Logistics', 'Machinery', 'Works', 'Rail'],
  },
  realestate: {
    id: 'realestate',
    nameTh: 'อสังหาริมทรัพย์',
    districtTh: 'ย่านอสังหาฯ',
    color: '#ebb39b',
    ground: '#f7e0d5',
    industriesTh: [
      'กองทรัสต์อสังหาฯ (REIT) เสาสัญญาณ',
      'REIT คลังสินค้าและโลจิสติกส์',
      'REIT ศูนย์ข้อมูล',
      'REIT ศูนย์การค้า',
      'REIT ที่อยู่อาศัยและอาคารเช่า',
      'REIT สถานพยาบาลและที่พักผู้สูงอายุ',
    ],
    suffixes: ['Realty', 'Properties', 'REIT', 'Estates', 'Land', 'Towers'],
  },
};

// Avoid prefixes that match real company names (e.g. Delta, Atlas Air) to keep the disguise.
export const NAME_PREFIXES = [
  'Aurora', 'Lumen', 'Nova', 'Vertex', 'Zenith', 'Orion', 'Atlas', 'Helio', 'Cobalt', 'Willow',
  'Saffron', 'Indigo', 'Pinecrest', 'Harbor', 'Summit', 'Crescent', 'Maple', 'Quartz', 'Ember', 'Juniper',
  'Solace', 'Tidal', 'Granite', 'Opal', 'Meridian', 'Northstar', 'Bluebird', 'Silverline', 'Cedar', 'Kestrel',
  'Lotus', 'Polaris', 'Riverstone', 'Sable', 'Topaz', 'Vista', 'Aspen', 'Beacon', 'Coral', 'Dune',
  'Echo', 'Falcon', 'Garnet', 'Horizon', 'Iris', 'Jade', 'Keystone', 'Lark', 'Magnolia', 'Nimbus',
];
