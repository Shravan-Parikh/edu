// import React, { useState, KeyboardEvent } from 'react';

// interface SearchBarProps {
//   value: string;
//   onChange: (value: string) => void;
//   onSearch: (query: string) => void;
//   isLoading?: boolean;
// }

// export const SearchBar = ({ value, onChange, onSearch, isLoading }: SearchBarProps) => {
//   const [localValue, setLocalValue] = useState(value);

//   const handleSubmit = () => {
//     if (localValue.trim()) {
//       onSearch(localValue.trim());
//     }
//   };

//   const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
//     const newValue = e.target.value;
//     setLocalValue(newValue);
//     onChange(newValue);
//   };

//   const handleKeyPress = (e: KeyboardEvent<HTMLInputElement>) => {
//     if (e.key === 'Enter') {
//       handleSubmit();
//     }
//   };

//   return (
//     <div className="relative">
//       <input
//         type="text"
//         value={localValue}
//         onChange={handleChange}
//         onKeyPress={handleKeyPress}
//         placeholder="Enter your query..."
//         className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg focus:outline-none focus:border-primary"
//         disabled={isLoading}
//       />
//       <button
//         onClick={handleSubmit}
//         disabled={isLoading || !localValue.trim()}
//         className={`absolute right-2 top-1/2 transform -translate-y-1/2 px-4 py-1 rounded-md 
//           ${isLoading || !localValue.trim() 
//             ? 'bg-gray-700 text-gray-400 cursor-not-allowed' 
//             : 'bg-primary text-white hover:bg-primary/90'}`}
//       >
//         {isLoading ? 'Searching...' : 'Search'}
//       </button>
//     </div>
//   );
// }; 