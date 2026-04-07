import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useReducer,
  useRef,
  type ReactNode
} from 'react';
import { generateGroupId } from '@hengsch/shared-logic';
import type { Group } from '@hengsch/shared-types';
import { storage } from '../utils/asyncStorageAdapter';

interface GroupState {
  groups: Group[];
}

type GroupAction =
  | { type: 'SET_GROUPS'; payload: Group[] }
  | { type: 'ADD_GROUP'; payload: Group }
  | { type: 'UPDATE_GROUP'; payload: { id: string; updates: Partial<Group> } }
  | { type: 'DELETE_GROUP'; payload: string };

interface GroupContextType {
  state: GroupState;
  addGroup: (group: Omit<Group, 'id' | 'createdAt'>) => void;
  updateGroup: (id: string, updates: Partial<Group>) => void;
  deleteGroup: (id: string) => void;
  getGroupById: (id: string) => Group | undefined;
}

export const DEFAULT_GROUP_COLORS = [
  '#e8c56a',
  '#b8d5f2',
  '#efc3ae',
  '#b9d8c0',
  '#cdc2e9',
  '#e7c7cf',
  '#f0e3b5',
  '#c9dfdd',
  '#d7bca5',
  '#c6d9cf',
  '#ddd0bf',
  '#efe2d3'
];

function createFallbackGroup(): Group {
  return {
    id: 'default',
    name: '未分类',
    color: '#f4f0e7',
    createdAt: Date.now()
  };
}

const GroupContext = createContext<GroupContextType | undefined>(undefined);

function groupReducer(state: GroupState, action: GroupAction): GroupState {
  switch (action.type) {
    case 'SET_GROUPS':
      return { ...state, groups: action.payload };
    case 'ADD_GROUP':
      return { ...state, groups: [...state.groups, action.payload] };
    case 'UPDATE_GROUP':
      return {
        ...state,
        groups: state.groups.map((group) =>
          group.id === action.payload.id ? { ...group, ...action.payload.updates } : group
        )
      };
    case 'DELETE_GROUP':
      return {
        ...state,
        groups: state.groups.filter((group) => group.id !== action.payload)
      };
    default:
      return state;
  }
}

export function GroupProvider({ children }: { children: ReactNode }): React.ReactElement {
  const [state, dispatch] = useReducer(groupReducer, { groups: [] });
  const isLoadedRef = useRef(false);

  const loadGroups = useCallback(async () => {
    try {
      const savedGroups = await storage.get<Group[]>('groups');

      if (savedGroups && Array.isArray(savedGroups) && savedGroups.length > 0) {
        dispatch({ type: 'SET_GROUPS', payload: savedGroups });
      } else {
        dispatch({ type: 'SET_GROUPS', payload: [createFallbackGroup()] });
      }
    } catch (error) {
      console.error('Failed to load groups:', error);
      dispatch({ type: 'SET_GROUPS', payload: [createFallbackGroup()] });
    } finally {
      isLoadedRef.current = true;
    }
  }, []);

  const saveGroups = useCallback(async () => {
    try {
      await storage.set('groups', state.groups);
    } catch (error) {
      console.error('Failed to save groups:', error);
    }
  }, [state.groups]);

  useEffect(() => {
    void loadGroups();
  }, [loadGroups]);

  useEffect(() => {
    if (isLoadedRef.current) {
      void saveGroups();
    }
  }, [saveGroups]);

  const addGroup = (groupData: Omit<Group, 'id' | 'createdAt'>): void => {
    dispatch({
      type: 'ADD_GROUP',
      payload: {
        ...groupData,
        id: generateGroupId(),
        createdAt: Date.now()
      }
    });
  };

  const updateGroup = (id: string, updates: Partial<Group>): void => {
    dispatch({ type: 'UPDATE_GROUP', payload: { id, updates } });
  };

  const deleteGroup = (id: string): void => {
    if (id === 'default') {
      return;
    }

    dispatch({ type: 'DELETE_GROUP', payload: id });
  };

  const getGroupById = (id: string): Group | undefined => {
    return state.groups.find((group) => group.id === id);
  };

  return (
    <GroupContext.Provider value={{ state, addGroup, updateGroup, deleteGroup, getGroupById }}>
      {children}
    </GroupContext.Provider>
  );
}

export function useGroups(): GroupContextType {
  const context = useContext(GroupContext);

  if (!context) {
    throw new Error('useGroups must be used within a GroupProvider');
  }

  return context;
}
