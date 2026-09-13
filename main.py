import pandas as pd
import numpy as np
import re

def insert_missing_commas(s):
    if not isinstance(s, str):
        return s
    return re.sub(r'(?<=[A-Za-z0-9])(\d+:)', r', \1', s)

def extract_labels(s):
    if not isinstance(s, str):
        return s
    tokens = re.findall(r'\d+:[A-Za-z0-9]+(?:-[A-Za-z0-9]+)?', s)
    return ', '.join(tokens)

ROMAN_VALUES = {'I': 1, 'V': 5, 'X': 10, 'L': 50, 'C': 100, 'D': 500, 'M': 1000}

def roman_to_int(s):
    total = 0
    prev = 0
    for ch in reversed(s.upper()):
        val = ROMAN_VALUES.get(ch)
        if val is None:
            return None  # not a valid roman numeral
        if val < prev:
            total -= val
        else:
            total += val
            prev = val
    return total

def convert_roman_labels(s):
    if not isinstance(s, str):
        return s

    def convert_token(token):
        if ':' not in token:
            return token  # not a valid N:label token, leave as-is
        num, label = token.split(':', 1)
        if re.fullmatch(r'[IVXLCDM]+', label, re.IGNORECASE):
            arabic = roman_to_int(label)
            if arabic is not None:
                return f'{num}:{arabic}'
        return token

    tokens = s.split(', ')
    return ', '.join(convert_token(t) for t in tokens)

def normalize_name(name):
    if not isinstance(name, str):
        return name

    # Strip parenthetical dates, e.g. "(1777 - 1858)" or "(b. 1820)"
    name = re.sub(r'\(.*?\)', '', name).strip()

    # Reorder "Last, First Middle" -> "First Middle Last"
    if ',' in name:
        last, first = name.split(',', 1)
        name = f"{first.strip()} {last.strip()}"

    return name.strip()

def remove_gender_tag(name):
    if not isinstance(name, str):
        return name

    return re.sub(r'\^\^.*$', '', name).strip()

def main():
    # Clean letters.
    letters_file = "Datasets/GeorgeEliotLetters.csv"
    
    l_data = pd.read_csv(letters_file)

    l_data['Dublin Core:Identifier'] = (
        l_data['Dublin Core:Identifier']
        .str.split("^^", regex=False).str[0]
        .str.replace(r'[\r\n]+', '', regex=True)
        .str.strip()
    )

    l_data['Dublin Core:Subject'] = l_data['Dublin Core:Subject'].apply(remove_gender_tag)
    l_data['Dublin Core:Creator'] = l_data['Dublin Core:Creator'].apply(remove_gender_tag)

    l_data[['Item Id', 'Dublin Core:Subject', 'Dublin Core:Creator', 'Dublin Core:Identifier']].to_csv('letters_output.csv', index=False)

    # Clean gallery.
    gallery_file = "Datasets/GeorgeEliotGallery.csv"

    g_data = pd.read_csv(gallery_file)

    g_data['Dublin Core:Relation'] = (
        g_data['Dublin Core:Relation']
        .apply(insert_missing_commas)
        .apply(extract_labels)
        .apply(convert_roman_labels)
    )

    g_data['Dublin Core:Title'] = (
        g_data['Dublin Core:Title']
        .apply(normalize_name)
    )

    g_data[['Dublin Core:Title', 'Dublin Core:Relation']].to_csv('gallery_output.csv', index=False)

if __name__ == "__main__":
    main()
