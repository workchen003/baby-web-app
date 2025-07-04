// src/lib/records.ts

import { db } from './firebase';
import { 
  collection, 
  addDoc, 
  doc,
  updateDoc,
  deleteDoc,
  serverTimestamp, 
  DocumentData,
  Timestamp,
  query,
  where,
  orderBy,
  getDocs,
  limit,
  startAfter,
  QueryDocumentSnapshot,
  QueryConstraint
} from 'firebase/firestore';
import { UserProfile } from '@/contexts/AuthContext';

// [新增] 將此共用型別定義在此處並匯出，作為唯一的真實來源
export type CreatableRecordType = 'feeding' | 'diaper' | 'sleep' | 'solid-food' | 'measurement' | 'snapshot';

// [修改] RecordData 介面，為 'snapshot' 新增了所有需要的欄位
export interface RecordData extends DocumentData {
  familyId: string;
  babyId: string;
  creatorId: string;
  creatorName: string | null;
  type: 'feeding' | 'diaper' | 'sleep' | 'solid-food' | 'measurement' | 'bmi' | 'snapshot';
  timestamp: Timestamp;
  notes?: string;
  
  // For feeding
  amount?: number;
  method?: 'bottle' | 'breastfeeding';
  
  // For diaper
  diaperType?: ('wet' | 'dirty')[];

  // For sleep
  startTime?: Timestamp;
  endTime?: Timestamp;

  // For solid food
  foodItems?: string;
  reaction?: 'good' | 'neutral' | 'bad';

  // For measurement or BMI
  measurementType?: 'height' | 'weight' | 'headCircumference';
  value?: number;
  
  // For snapshot
  imageUrl?: string;
  tags?: string[];
  year?: number;
  month?: number;
}

/**
 * [修改] 新增一筆記錄到 Firestore，並修復了 serverTimestamp 的型別問題
 */
export const addRecord = async (recordData: Partial<RecordData>, userProfile: UserProfile | null) => {
  if (!recordData.familyId || !recordData.creatorId) {
    throw new Error('Family ID and Creator ID are required.');
  }
  if (!userProfile) {
    throw new Error('User profile is not available.');
  }

  try {
    // [修改] 移除對 dataToSave 的型別註記，讓 TypeScript 自動推斷，以解決 FieldValue 的型別衝突
    const dataToSave = {
      ...recordData,
      babyId: 'baby_01',
      creatorName: userProfile.displayName,
      timestamp: recordData.timestamp || serverTimestamp(),
    };
    
    // [新增] 如果是 snapshot 類型，自動從 timestamp 中提取並儲存年份和月份
    if (recordData.type === 'snapshot' && dataToSave.timestamp instanceof Timestamp) {
        const date = dataToSave.timestamp.toDate();
        dataToSave.year = date.getFullYear();
        dataToSave.month = date.getMonth() + 1; // getMonth() 回傳 0-11，所以要加 1
    }

    const docRef = await addDoc(collection(db, 'records'), dataToSave);
    console.log('Document written with ID: ', docRef.id);
    return docRef;
  } catch (e) {
    console.error('Error adding document: ', e);
    throw new Error('Failed to add record.');
  }
};


/**
 * [修改] 獲取照片牆的紀錄，包含篩選和分頁功能，並修正了查詢建立方式
 */
export const getSnapshots = async (
  familyId: string, 
  options: { 
    perPage?: number; 
    lastDoc?: QueryDocumentSnapshot<DocumentData>;
    filter?: {
      year?: number;
      month?: number;
      tag?: string;
    }
  } = {}
) => {
  const perPage = options.perPage || 20;
  const recordsRef = collection(db, "records");
  
  // [修改] 將共用的查詢條件放在一個基礎陣列中
  const baseConstraints: QueryConstraint[] = [
    where("familyId", "==", familyId),
    where("type", "==", "snapshot"),
  ];

  // [新增] 根據篩選條件動態加入 where 子句
  if (options.filter) {
    if (options.filter.year) {
      baseConstraints.push(where("year", "==", options.filter.year));
    }
    if (options.filter.month) {
      baseConstraints.push(where("month", "==", options.filter.month));
    }
    if (options.filter.tag && options.filter.tag.trim() !== '') {
      baseConstraints.push(where("tags", "array-contains", options.filter.tag.trim()));
    }
  }
  
  // 排序和分頁條件要放在篩選條件之後
  baseConstraints.push(orderBy("timestamp", "desc"));
  baseConstraints.push(limit(perPage));

  if (options.lastDoc) {
    baseConstraints.push(startAfter(options.lastDoc));
  }

  const q = query(recordsRef, ...baseConstraints);

  const querySnapshot = await getDocs(q);
  const snapshots = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  
  return {
    snapshots,
    lastVisible: querySnapshot.docs[querySnapshot.docs.length - 1],
  };
};

// --- 以下為既有函式 ---

export const updateRecord = async (recordId: string, updatedData: Partial<RecordData>) => {
  if (!recordId) {
    throw new Error('Record ID is required for updating.');
  }
  const recordRef = doc(db, 'records', recordId);
  try {
    await updateDoc(recordRef, updatedData);
    console.log('Document updated with ID: ', recordId);
  } catch (e) {
    console.error('Error updating document: ', e);
    throw new Error('Failed to update record.');
  }
};

export const deleteRecord = async (recordId: string) => {
  if (!recordId) {
    throw new Error('Record ID is required for deletion.');
  }
  const recordRef = doc(db, 'records', recordId);
  try {
    await deleteDoc(recordRef);
    console.log('Document deleted with ID: ', recordId);
  } catch (e) {
    console.error('Error deleting document: ', e);
    throw new Error('Failed to delete record.');
  }
};

export const getMeasurementRecords = async (familyId: string, babyId: string) => {
  const recordsRef = collection(db, 'records');
  const q = query(
    recordsRef,
    where('familyId', '==', familyId),
    where('babyId', '==', babyId),
    where('type', '==', 'measurement'),
    orderBy('timestamp', 'asc')
  );

  const querySnapshot = await getDocs(q);
  return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
};